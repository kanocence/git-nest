import type { Buffer } from 'node:buffer'
import type { AgentRuntimeConfig } from './config'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

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
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
  ) => Promise<HermesRunResult>
}

export function createHermesRunner(config: AgentRuntimeConfig): HermesRunner {
  return {
    name: 'hermes',

    async run(params: HermesRunParams, abortSignal: AbortSignal, onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void): Promise<HermesRunResult> {
      const runDir = path.posix.join(config.stateDir, 'runs', params.runId)
      mkdirSync(runDir, { recursive: true })
      const promptPath = path.posix.join(runDir, 'prompt.md')
      const logPath = path.posix.join(runDir, 'hermes.log')

      // 检查 Hermes 数据目录权限
      try {
        const stats = statSync(config.hermesHostDataDir)
        const expectedUid = Number.parseInt(config.runtimeUid, 10)
        if (stats.uid !== expectedUid) {
          const errorMessage = `Hermes data directory ${config.hermesHostDataDir} is owned by UID ${stats.uid}, but the container runs as UID ${expectedUid}. This causes Permission denied errors when the container tries to create files in /opt/data. To fix this, run: chown -R ${config.runtimeUid}:${config.runtimeGid} ${config.hermesHostDataDir}`
          writeFileSync(logPath, `[git-nest] ${errorMessage}\n`, 'utf8')
          return {
            status: 'failed',
            summary: errorMessage,
            continuationEligible: false,
            exitCode: null,
            rawLogPath: logPath,
            timedOut: false,
          }
        }
      }
      catch {
        // 无法读取目录权限信息，继续执行，让 Docker 自行报错
      }

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

      console.warn('[hermes] starting container', { runId: params.runId, args })

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
        catch (err: any) {
          console.error('[hermes] failed to append log', { runId: params.runId, error: err })
        }
      }

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        logChunk(chunk)
        onOutput(chunk, 'stdout')
      })

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        logChunk(chunk)
        onOutput(chunk, 'stderr')
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
              console.warn('[hermes] container already exited before kill', { runId: params.runId, containerName, signal })
              resolve('missing')
              return
            }

            if (code !== 0 && stderr) {
              console.error('[hermes] docker kill stderr', { runId: params.runId, containerName, signal, stderr: trimmedStderr })
            }
            resolve('failed')
          })
          child.on('error', (err) => {
            console.error('[hermes] docker kill error', { runId: params.runId, containerName, signal, error: err.message })
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
          console.error('[hermes] container kill failed', { runId: params.runId, signal })
        }
      }

      const setupForceKill = () => {
        clearTimeout(forceKillTimer)
        forceKillTimer = setTimeout(() => {
          if (!processClosed) {
            console.error('[hermes] force killing container after graceful timeout', { runId: params.runId })
            terminate('SIGKILL')
          }
        }, 5000)
      }

      const handleAbort = () => {
        if (cancelled)
          return

        console.warn('[hermes] abort signal received, killing container', { runId: params.runId })
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
          console.error('[hermes] execution timeout', { runId: params.runId, timeoutMs })
          terminate('SIGTERM')
          setupForceKill()
        }, timeoutMs)

        child.on('close', (code) => {
          finish(code)
        })
        child.on('error', (err: NodeJS.ErrnoException) => {
          console.error('[hermes] process error', { runId: params.runId, error: err.message })
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

      let errorSummary = exitCode === 127
        ? 'Docker CLI is not installed or not available in PATH'
        : `Hermes executor failed with exit code ${exitCode}`

      // 尝试读取日志文件最后 500 字符作为诊断信息
      try {
        const logContent = readFileSync(logPath, 'utf8')
        const lastChunk = logContent.slice(-500).trim()
        if (lastChunk) {
          errorSummary += `\n\n--- Last log output ---\n${lastChunk}`
        }
      }
      catch {
        // 日志文件读取失败，忽略
      }

      return {
        status: 'failed',
        summary: errorSummary,
        continuationEligible: false,
        exitCode,
        rawLogPath: logPath,
        timedOut: false,
      }
    },
  }
}
