export interface CodingExecutorInput {
  runId: string
  repo: string
  workspacePath: string
  prompt: string
  acceptanceCommands: string[]
  model: {
    provider: string
    model: string
  }
  maxTurns: number
  timeoutMs: number
  env: Record<string, string>
}

export interface CodingExecutorEvent {
  type: 'log' | 'action' | 'tool' | 'error' | 'completed' | 'progress'
  message: string
  payload?: unknown
  timestamp: number
}

export interface CodingExecutorResult {
  status: 'completed' | 'failed' | 'cancelled'
  summary: string
  exitCode: number
  rawLogPath?: string
  /** True if the executor reported tool/internal errors during an otherwise clean exit */
  hasToolErrors?: boolean
}

export interface CodingExecutor {
  name: string
  run: (input: CodingExecutorInput, abortSignal: AbortSignal) => AsyncGenerator<CodingExecutorEvent, CodingExecutorResult, unknown>
}

export interface ExecutorConfig {
  type: 'goose'
  maxTurns: number
  timeoutMs: number
  env: Record<string, string>
}
