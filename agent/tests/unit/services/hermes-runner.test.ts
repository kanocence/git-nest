import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHermesRunner } from '../../../src/services/hermes-runner'

const { mockSpawn, mockChild, mockMkdirSync, mockWriteFileSync, mockAppendFileSync } = vi.hoisted(() => {
  const mockChild = {
    stdout: { on: vi.fn(), pipe: vi.fn() },
    stderr: { on: vi.fn(), pipe: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false,
  }
  const mockSpawn = vi.fn(() => mockChild)
  const mockMkdirSync = vi.fn()
  const mockWriteFileSync = vi.fn()
  const mockAppendFileSync = vi.fn()
  return { mockSpawn, mockChild, mockMkdirSync, mockWriteFileSync, mockAppendFileSync }
})

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}))

vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
}))

const baseConfig = {
  hermesImage: 'nousresearch/hermes-agent:latest',
  hermesToolsets: 'file,terminal',
  hermesProvider: 'openrouter',
  hermesModel: 'gpt-4',
  hermesHostWorkspaceDir: '/var/data/workspace',
  hermesHostStateDir: '/var/data/agent-state',
  hermesHostDataDir: '/var/data/hermes',
  stateDir: '/var/data/agent-state',
  runtimeUid: '1000',
  runtimeGid: '1000',
}

describe('createHermesRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn.mockReturnValue(mockChild)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return runner with name hermes', () => {
    const runner = createHermesRunner(baseConfig)
    expect(runner.name).toBe('hermes')
    expect(typeof runner.run).toBe('function')
  })
})

describe('hermesRunner.run Docker args', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn.mockReturnValue(mockChild)
  })

  it('should construct correct docker args with all config', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-123',
        repo: 'my-repo',
        workspacePath: '/data/workspace/my-repo/runs/run-123',
        prompt: 'Test prompt',
        maxTurns: 30,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    // Wait for initial spawn
    await new Promise(r => setTimeout(r, 10))

    const dockerArgs = (mockSpawn.mock.calls[0] as unknown as [string, string[]])[1]

    expect(dockerArgs).toContain('run')
    expect(dockerArgs).toContain('--rm')
    expect(dockerArgs).toContain('--name=git-nest-hermes-run-123')
    expect(dockerArgs).toContain('--user=1000:1000')
    expect(dockerArgs).toContain('-w=/data/workspace/my-repo/runs/run-123')
    expect(dockerArgs).toContain('-v=/var/data/workspace:/data/workspace')
    expect(dockerArgs).toContain('-v=/var/data/hermes:/opt/data')
    expect(dockerArgs).toContain('-v=/var/data/agent-state/runs/run-123/prompt.md:/tmp/git-nest-prompt.md:ro')

    expect(dockerArgs).toContain('nousresearch/hermes-agent:latest')
    expect(dockerArgs).toContain('chat')
    expect(dockerArgs).toContain('--quiet')
    expect(dockerArgs).toContain('--yolo')
    expect(dockerArgs).toContain('--source')
    expect(dockerArgs).toContain('tool')
    expect(dockerArgs).toContain('--toolsets')
    expect(dockerArgs).toContain('--max-turns')
    expect(dockerArgs).toContain('--provider')
    expect(dockerArgs).toContain('openrouter')
    expect(dockerArgs).toContain('--model')
    expect(dockerArgs).toContain('gpt-4')

    // Emit close to resolve
    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })

  it('should mount data to /opt/data', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-456',
        repo: 'test-repo',
        workspacePath: '/data/workspace/test-repo/runs/run-456',
        prompt: 'Prompt',
        maxTurns: 10,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await new Promise(r => setTimeout(r, 10))

    const dockerArgs = (mockSpawn.mock.calls[0] as unknown as [string, string[]])[1]
    const dataMount = dockerArgs.find((arg: string) => arg.includes(':/opt/data'))
    expect(dataMount).toBeDefined()
    expect(dataMount).toMatch(/-v=\/var\/data\/hermes:\/opt\/data/)

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })

  it('should use host absolute paths for bind mounts', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-789',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-789',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await new Promise(r => setTimeout(r, 10))

    const dockerArgs = (mockSpawn.mock.calls[0] as unknown as [string, string[]])[1]
    const mountSources = dockerArgs
      .filter((arg: string) => arg.startsWith('-v='))
      .map((arg: string) => arg.split(':')[0].slice(3))

    for (const source of mountSources) {
      expect(source).toMatch(/^\/var\/data\//)
    }

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })

  it('should omit --provider and --model when empty', async () => {
    const config = { ...baseConfig, hermesProvider: '', hermesModel: '' }
    const runner = createHermesRunner(config)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-empty',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-empty',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await new Promise(r => setTimeout(r, 10))

    const dockerArgs = (mockSpawn.mock.calls[0] as unknown as [string, string[]])[1]
    const providerIdx = dockerArgs.indexOf('--provider')
    const modelIdx = dockerArgs.indexOf('--model')

    expect(providerIdx).toBe(-1)
    expect(modelIdx).toBe(-1)

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })
})

describe('hermesRunner.run output handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn.mockReturnValue(mockChild)
  })

  it('should trigger onOutput with stdout chunks', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()
    const outputs: string[] = []

    const runPromise = runner.run(
      {
        runId: 'run-output',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-output',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      chunk => outputs.push(chunk),
    )

    await new Promise(r => setTimeout(r, 10))

    const stdoutHandler = (mockChild.stdout.on.mock.calls as any[]).find((c: any[]) => c[0] === 'data')?.[1]
    expect(stdoutHandler).toBeDefined()

    stdoutHandler?.(Buffer.from('hello '))
    stdoutHandler?.(Buffer.from('world'))

    expect(outputs).toContain('hello ')
    expect(outputs).toContain('world')

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })

  it('should trigger onOutput with stderr chunks', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()
    const outputs: string[] = []

    const runPromise = runner.run(
      {
        runId: 'run-stderr',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-stderr',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      chunk => outputs.push(chunk),
    )

    await new Promise(r => setTimeout(r, 10))

    const stderrHandler = (mockChild.stderr.on.mock.calls as any[]).find((c: any[]) => c[0] === 'data')?.[1]
    expect(stderrHandler).toBeDefined()

    stderrHandler?.(Buffer.from('error message'))
    expect(outputs).toContain('error message')

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })
})

describe('hermesRunner.run timeout and cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn.mockReturnValue(mockChild)
  })

  it('should return continuationEligible true on timeout', async () => {
    vi.useFakeTimers()
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-timeout',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-timeout',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    // Wait for spawn
    await vi.advanceTimersByTimeAsync(10)

    vi.advanceTimersByTime(1200)

    // Emit close after timeout
    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(137)

    const result = await runPromise

    expect(result.status).toBe('failed')
    expect(result.timedOut).toBe(true)
    expect(result.continuationEligible).toBe(true)

    vi.useRealTimers()
  })

  it('should launch docker kill on timeout', async () => {
    vi.useFakeTimers()
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-kill',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-kill',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await vi.advanceTimersByTimeAsync(10)
    vi.advanceTimersByTime(1200)

    // Expect docker kill was spawned
    const killCalls = (mockSpawn.mock.calls as any[]).filter((c: any[]) => c[0] === 'docker' && c[1][0] === 'kill')
    expect(killCalls.length).toBeGreaterThanOrEqual(1)

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(137)

    await runPromise
    vi.useRealTimers()
  })

  it('should return cancelled on abort signal', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-abort',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-abort',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 5000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await new Promise(r => setTimeout(r, 10))

    abortController.abort()

    // Simulate child close after abort
    await new Promise(r => setTimeout(r, 50))
    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(null)

    const result = await runPromise

    expect(result.status).toBe('cancelled')
    expect(result.continuationEligible).toBe(false)
    expect(result.timedOut).toBe(false)
  })

  it('should launch docker kill on abort', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-abort-kill',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-abort-kill',
        prompt: 'P',
        maxTurns: 5,
        timeoutMs: 5000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await new Promise(r => setTimeout(r, 10))

    const killCallsBefore = (mockSpawn.mock.calls as any[]).filter((c: any[]) => c[0] === 'docker' && c[1][0] === 'kill').length

    abortController.abort()

    await new Promise(r => setTimeout(r, 50))

    const killCallsAfter = (mockSpawn.mock.calls as any[]).filter((c: any[]) => c[0] === 'docker' && c[1][0] === 'kill').length
    expect(killCallsAfter).toBeGreaterThan(killCallsBefore)

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(null)

    await runPromise
  })
})

describe('hermesRunner.run prompt file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn.mockReturnValue(mockChild)
  })

  it('should write prompt to state dir not workspace', async () => {
    const runner = createHermesRunner(baseConfig)
    const abortController = new AbortController()

    const runPromise = runner.run(
      {
        runId: 'run-prompt',
        repo: 'repo',
        workspacePath: '/data/workspace/repo/runs/run-prompt',
        prompt: 'Important task prompt here',
        maxTurns: 5,
        timeoutMs: 1000,
        toolsets: 'file,terminal',
      },
      abortController.signal,
      () => {},
    )

    await new Promise(r => setTimeout(r, 10))

    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/var/data/agent-state/runs/run-prompt',
      { recursive: true },
    )

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/var/data/agent-state/runs/run-prompt/prompt.md',
      'Important task prompt here',
      'utf8',
    )

    const closeHandler = (mockChild.on.mock.calls as any[]).find((c: any[]) => c[0] === 'close')?.[1]
    if (closeHandler)
      closeHandler(0)

    await runPromise
  })
})
