import type { CodingExecutor, CodingExecutorEvent, CodingExecutorInput, CodingExecutorResult } from './types'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { info, error as logError } from '../../logger'

export function createGooseExecutor(stateDir: string): CodingExecutor {
  return {
    name: 'goose',

    async* run(input: CodingExecutorInput, abortSignal: AbortSignal): AsyncGenerator<CodingExecutorEvent, CodingExecutorResult, unknown> {
      const runDir = path.join(stateDir, 'runs', input.runId)
      mkdirSync(runDir, { recursive: true })
      const logPath = path.join(runDir, 'goose.log')

      const instructionsPath = path.join(runDir, 'instructions.txt')
      writeFileSync(instructionsPath, input.prompt, 'utf8')

      const args = [
        'run',
        '--no-session',
        '--output-format',
        'stream-json',
        '--provider',
        mapProvider(input.model.provider),
        '--model',
        input.model.model,
        '--max-turns',
        String(input.maxTurns),
        '--instructions',
        instructionsPath,
      ]

      // 透传所有环境变量，Goose 需要的配置（如 OPENAI_API_KEY, ANTHROPIC_API_KEY 等）
      // 由用户通过环境变量直接设置，Agent 不做任何转换或映射
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
      )
      Object.assign(env, input.env)

      info('[goose] starting', { runId: input.runId, args })

      yield {
        type: 'log',
        message: `Starting Goose executor for run ${input.runId}`,
        timestamp: Date.now(),
      }

      const child = spawn('goose', args, {
        cwd: input.workspacePath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const eventQueue: CodingExecutorEvent[] = []
      let wakeConsumer: (() => void) | null = null
      let stdoutRemainder = ''
      let timedOut = false
      let processError: string | null = null
      let processClosed = false
      let forceKillTimer: NodeJS.Timeout | undefined
      let hadToolErrors = false

      const pushEvent = (event: CodingExecutorEvent) => {
        eventQueue.push(event)
        wakeConsumer?.()
        wakeConsumer = null
      }

      const waitForEvent = () => new Promise<void>((resolve) => {
        wakeConsumer = resolve
      })

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        appendFileSync(logPath, chunk, 'utf8')

        const lines = `${stdoutRemainder}${chunk}`.split('\n')
        stdoutRemainder = lines.pop() || ''

        for (const line of lines) {
          const event = parseGooseOutputLine(line)
          if (event) {
            if (event.type === 'error')
              hadToolErrors = true
            pushEvent(event)
          }
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        appendFileSync(logPath, `[stderr] ${chunk}`, 'utf8')
        const trimmed = chunk.trim()
        if (trimmed) {
          pushEvent({
            type: 'log',
            message: trimmed,
            timestamp: Date.now(),
          })
        }
      })

      const terminate = () => {
        if (processClosed)
          return
        if (!child.killed)
          child.kill('SIGTERM')
        clearTimeout(forceKillTimer)
        forceKillTimer = setTimeout(() => {
          if (!processClosed)
            child.kill('SIGKILL')
        }, 5000)
      }

      abortSignal.addEventListener('abort', () => {
        info('[goose] abort signal received, killing process', { runId: input.runId })
        terminate()
      })

      const timeoutMs = input.timeoutMs || 30 * 60 * 1000
      const closePromise = new Promise<number>((resolve) => {
        let settled = false
        let timeoutTimer: NodeJS.Timeout | undefined
        const finish = (code: number) => {
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
          logError('[goose] execution timeout', { runId: input.runId, timeoutMs })
          terminate()
        }, timeoutMs)

        child.on('close', (code) => {
          if (stdoutRemainder.trim()) {
            const event = parseGooseOutputLine(stdoutRemainder)
            if (event)
              pushEvent(event)
            stdoutRemainder = ''
          }
          finish(timedOut ? 124 : code ?? 1)
        })
        child.on('error', (err: NodeJS.ErrnoException) => {
          processError = err.code === 'ENOENT'
            ? 'Goose CLI is not installed or not available in PATH'
            : `Goose process error: ${err.message}`
          logError('[goose] process error', { runId: input.runId, error: err.message })
          pushEvent({
            type: 'error',
            message: processError,
            payload: { code: err.code, message: err.message },
            timestamp: Date.now(),
          })
          finish(err.code === 'ENOENT' ? 127 : 1)
        })
      })

      let exitCode: number | null = null
      while (exitCode === null || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          const event = eventQueue.shift()
          if (event)
            yield event
          continue
        }

        await Promise.race([
          closePromise.then((code) => {
            exitCode = code
          }),
          waitForEvent(),
        ])
      }

      yield {
        type: 'completed',
        message: processError || `Goose executor exited with code ${exitCode}`,
        payload: { exitCode, timedOut },
        timestamp: Date.now(),
      }

      return {
        status: exitCode === 0 ? 'completed' : 'failed',
        summary: exitCode === 0
          ? 'Goose executor completed successfully'
          : processError || (timedOut ? 'Goose executor timed out' : `Goose executor failed with exit code ${exitCode}`),
        exitCode,
        rawLogPath: logPath,
        hasToolErrors: hadToolErrors,
      }
    },
  }
}

function parseGooseOutputLine(line: string): CodingExecutorEvent | null {
  const trimmed = line.trim()
  if (!trimmed)
    return null

  try {
    const parsed = JSON.parse(trimmed)
    return {
      type: normalizeEventType(parsed.type),
      message: typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed),
      payload: parsed,
      timestamp: Date.now(),
    }
  }
  catch {
    return {
      type: 'log',
      message: trimmed,
      timestamp: Date.now(),
    }
  }
}

function normalizeEventType(type: unknown): CodingExecutorEvent['type'] {
  if (type === 'action' || type === 'tool' || type === 'error' || type === 'completed' || type === 'progress')
    return type
  return 'log'
}

function mapProvider(provider: string): string {
  const mapping: Record<string, string> = {
    'openai': 'openai',
    'kimi': 'openai',
    'minimax': 'openai',
    'minimax-cn': 'openai',
    'minimax-intl': 'openai',
    'anthropic': 'anthropic',
    'google': 'google',
    'azure_openai': 'azure_openai',
    'ollama': 'ollama',
  }
  return mapping[provider.toLowerCase()] || 'openai'
}
