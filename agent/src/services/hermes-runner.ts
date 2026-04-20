import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { info, error as logError } from '../logger'

export interface HermesRunParams {
  runId: string
  repo: string
  workspacePath: string
  prompt: string
  maxTurns: number
  timeoutMs: number
  toolsets: string
  provider?: string
  model?: string
}

export interface HermesRunResult {
  status: 'completed' | 'failed' | 'cancelled'
  summary: string
  continuationEligible: boolean
  exitCode: number | null
  rawLogPath: string
  timedOut: boolean
}

export interface HermesRunner {
  name: 'hermes'
  run: (
    params: HermesRunParams,
    abortSignal: AbortSignal,
    onOutput: (chunk: string) => void,
  ) => Promise<HermesRunResult>
}

export function createHermesRunner(config: {
  hermesImage: string
  hermesToolsets: string
  hermesProvider: string
  hermesModel: string
  hermesHostWorkspaceDir: string
  hermesHostStateDir: string
  hermesHostDataDir: string
  stateDir: string
  runtimeUid: string
  runtimeGid: string
}): HermesRunner {
  return {
    name: 'hermes',

    async run(params: HermesRunParams, abortSignal: AbortSignal, onOutput: (chunk: string) => void): Promise<HermesRunResult> {
      const runDir = path.posix.join(config.stateDir, 'runs', params.runId)
      mkdirSync(runDir, { recursive: true })
      const promptPath = path.posix.join(runDir, 'prompt.md')
      const logPath = path.posix.join(runDir, 'hermes.log')

      writeFileSync(promptPath, params.prompt, 'utf8')
      appendFileSync(logPath, `\n[git-nest] Hermes execution started at ${new Date().toISOString()}\n`, 'utf8')

      const hostPromptPath = path.posix.join(config.hermesHostStateDir, 'runs', params.runId, 'prompt.md')

      const args: string[] = [
        'run',
        '--rm',
        `--name=git-nest-hermes-${params.runId}`,
        `--user=${config.runtimeUid}:${config.runtimeGid}`,
        `-w=${params.workspacePath}`,
        `-v=${config.hermesHostWorkspaceDir}:/data/workspace`,
        `-v=${config.hermesHostDataDir}:/opt/data`,
        `-v=${hostPromptPath}:/tmp/git-nest-prompt.md:ro`,
      ]

      // Environment variables for Hermes provider API keys
      const envKeys = [
        'OPENROUTER_API_KEY',
        'ANTHROPIC_API_KEY',
        'KIMI_API_KEY',
        'KIMI_CN_API_KEY',
        'MINIMAX_API_KEY',
        'MINIMAX_CN_API_KEY',
        'DASHSCOPE_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'DEEPSEEK_API_KEY',
        'ARCEEAI_API_KEY',
        'XIAOMI_API_KEY',
        'HF_TOKEN',
        'XAI_API_KEY',
        'GLM_API_KEY',
      ]
      for (const key of envKeys) {
        if (process.env[key]) {
          args.push(`-e=${key}`)
        }
      }

      // Hermes CLI parameters
      args.push(config.hermesImage)
      args.push('chat')
      args.push('--quiet')
      args.push('--yolo')
      args.push('--source', 'tool')
      args.push('--toolsets', params.toolsets || config.hermesToolsets)
      args.push('--max-turns', String(params.maxTurns))

      const provider = params.provider || config.hermesProvider
      const model = params.model || config.hermesModel
      if (provider)
        args.push('--provider', provider)
      if (model)
        args.push('--model', model)

      args.push('--query', 'Read /tmp/git-nest-prompt.md and complete the task in the current working directory.')

      info('[hermes] starting container', { runId: params.runId, args })

      const child = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let timedOut = false
      let cancelled = false
      let processClosed = false
      let forceKillTimer: NodeJS.Timeout | undefined

      const logChunk = (chunk: string) => {
        try {
          appendFileSync(logPath, chunk, 'utf8')
        }
        catch (err) {
          logError('[hermes] failed to append log', { runId: params.runId, error: err })
        }
      }

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        logChunk(chunk)
        onOutput(chunk)
      })

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        logChunk(chunk)
        onOutput(chunk)
      })

      async function sendDockerKill(containerName: string, signal: NodeJS.Signals = 'SIGTERM'): Promise<'killed' | 'missing' | 'failed'> {
        return new Promise((resolve) => {
          const child = spawn('docker', ['kill', '--signal', signal, containerName])
          let stderr = ''
          child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString('utf8')
          })
          child.on('close', (code) => {
            if (code === 0) {
              resolve('killed')
              return
            }

            const trimmedStderr = stderr.trim()
            const lowerStderr = trimmedStderr.toLowerCase()
            if (lowerStderr.includes('no such container') || lowerStderr.includes('no such object')) {
              info('[hermes] container already exited before kill', { runId: params.runId, containerName, signal })
              resolve('missing')
              return
            }

            if (code !== 0 && stderr) {
              logError('[hermes] docker kill stderr', { runId: params.runId, containerName, signal, stderr: trimmedStderr })
            }
            resolve('failed')
          })
          child.on('error', (err) => {
            logError('[hermes] docker kill error', { runId: params.runId, containerName, signal, error: err.message })
            resolve('failed')
          })
        })
      }

      const terminate = async (signal: NodeJS.Signals = 'SIGTERM') => {
        if (processClosed)
          return

        const containerName = `git-nest-hermes-${params.runId}`
        const result = await sendDockerKill(containerName, signal)
        if (result === 'failed') {
          logError('[hermes] container kill failed', { runId: params.runId, signal })
        }
      }

      const setupForceKill = () => {
        clearTimeout(forceKillTimer)
        forceKillTimer = setTimeout(() => {
          if (!processClosed) {
            logError('[hermes] force killing container after graceful timeout', { runId: params.runId })
            terminate('SIGKILL')
          }
        }, 5000)
      }

      const handleAbort = () => {
        if (cancelled)
          return

        info('[hermes] abort signal received, killing container', { runId: params.runId })
        cancelled = true
        terminate('SIGTERM')
        setupForceKill()
      }
      abortSignal.addEventListener('abort', handleAbort, { once: true })
      if (abortSignal.aborted)
        handleAbort()

      const timeoutMs = params.timeoutMs || 30 * 60 * 1000
      const closePromise = new Promise<number | null>((resolve) => {
        let settled = false
        let timeoutTimer: NodeJS.Timeout | undefined
        const finish = (code: number | null) => {
          if (settled)
            return
          settled = true
          processClosed = true
          clearTimeout(timeoutTimer)
          clearTimeout(forceKillTimer)
          resolve(code)
        }

        timeoutTimer = setTimeout(() => {
          timedOut = true
          logError('[hermes] execution timeout', { runId: params.runId, timeoutMs })
          terminate('SIGTERM')
          setupForceKill()
        }, timeoutMs)

        child.on('close', (code) => {
          finish(code)
        })
        child.on('error', (err: NodeJS.ErrnoException) => {
          logError('[hermes] process error', { runId: params.runId, error: err.message })
          finish(err.code === 'ENOENT' ? 127 : 1)
        })
      })

      let exitCode: number | null
      try {
        exitCode = await closePromise
      }
      finally {
        abortSignal.removeEventListener('abort', handleAbort)
      }

      if (cancelled) {
        return {
          status: 'cancelled',
          summary: 'Hermes execution was cancelled by user',
          continuationEligible: false,
          exitCode,
          rawLogPath: logPath,
          timedOut: false,
        }
      }

      if (timedOut) {
        return {
          status: 'failed',
          summary: 'Hermes execution timeout was reached',
          continuationEligible: true,
          exitCode,
          rawLogPath: logPath,
          timedOut: true,
        }
      }

      if (exitCode === 0) {
        return {
          status: 'completed',
          summary: 'Hermes executor completed successfully',
          continuationEligible: false,
          exitCode,
          rawLogPath: logPath,
          timedOut: false,
        }
      }

      return {
        status: 'failed',
        summary: exitCode === 127
          ? 'Docker CLI is not installed or not available in PATH'
          : `Hermes executor failed with exit code ${exitCode}`,
        continuationEligible: false,
        exitCode,
        rawLogPath: logPath,
        timedOut: false,
      }
    },
  }
}
