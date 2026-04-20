import type { Config, EventPayload, RunRecord, RunStatus, TaskDefinition, TaskEdge, TaskNode } from '../../src/types'

export function createTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 3002,
    apiSecret: 'test-secret',
    allowInsecureNoAuth: false,
    dataDir: '/tmp/test/git',
    workspaceDir: '/tmp/test/workspace',
    stateDir: '/tmp/test/state',
    dbPath: '/tmp/test/state/db.sqlite',
    gitTimeoutMs: 30000,
    commandTimeoutMs: 120000,
    agentGitUserName: 'Test AI',
    agentGitUserEmail: 'test@example.com',
    webhookUrl: '',
    webhookSecret: '',
    webhookTimeoutMs: 30000,
    webhookMaxRetries: 3,
    executorMaxTurns: 30,
    executorTimeoutMs: 1800000,
    executorMaxContinuations: 2,
    hermesImage: 'nousresearch/hermes-agent:latest',
    hermesToolsets: 'file,terminal',
    hermesProvider: '',
    hermesModel: '',
    hermesHostWorkspaceDir: '/tmp/test/workspace',
    hermesHostStateDir: '/tmp/test/state',
    hermesHostDataDir: '/tmp/test/hermes',
    runtimeUid: '1000',
    runtimeGid: '1000',
    dockerGid: '999',
    ...overrides,
  }
}

export function createTestRun(overrides: Partial<RunRecord> = {}): RunRecord {
  const now = new Date().toISOString()
  return {
    id: `run-${Math.random().toString(36).slice(2, 9)}`,
    repo: 'test-repo',
    task_path: '.git-nest/tasks/test.yaml',
    task_title: 'Test Task',
    source_ref: 'main',
    base_branch: 'main',
    task_branch: `ai/run-${Math.random().toString(36).slice(2, 9)}`,
    status: 'queued' as RunStatus,
    workspace_path: '/tmp/test/workspace/test-repo',
    created_at: now,
    updated_at: now,
    last_error: null,
    ...overrides,
  }
}

export function createTestTaskDefinition(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  const nodes: TaskNode[] = [
    {
      id: 'start',
      role: 'pm',
      prompt: 'Analyze the requirements',
      tools: ['cat', 'grep', 'find'],
    },
    {
      id: 'implement',
      role: 'developer',
      prompt: 'Implement the feature',
      tools: ['cat', 'grep', 'find', 'git'],
    },
  ]

  const edges: TaskEdge[] = [
    { from: 'start', to: 'implement', condition: 'success' },
    { from: 'implement', to: 'end', condition: 'success' },
  ]

  const roles = [...new Set(nodes.map(n => n.role))]

  return {
    path: '.git-nest/tasks/test.yaml',
    title: 'Test Task',
    baseBranch: 'main',
    maxIterations: 5,
    nodes,
    edges,
    roles,
    hasHumanApproval: false,
    valid: true,
    validationErrors: [],
    parseError: null,
    ...overrides,
  }
}

export function createTestEvent(overrides: Partial<EventPayload> = {}): EventPayload {
  return {
    type: 'run.started',
    runId: `run-${Math.random().toString(36).slice(2, 9)}`,
    repo: 'test-repo',
    message: 'Test event',
    ...overrides,
  }
}
