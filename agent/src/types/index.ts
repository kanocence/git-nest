export interface Config {
  port: number
  apiSecret: string
  allowInsecureNoAuth: boolean
  dataDir: string
  workspaceDir: string
  stateDir: string
  dbPath: string
  gitTimeoutMs: number
  commandTimeoutMs: number
  agentGitUserName: string
  agentGitUserEmail: string
  webhookUrl: string
  webhookSecret: string
  webhookTimeoutMs: number
  webhookMaxRetries: number
  executorMaxTurns: number
  executorTimeoutMs: number
  gooseProvider: string
  gooseModel: string
}

export type RunStatus
  = | 'queued'
    | 'preparing'
    | 'running'
    | 'waiting_approval'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'system_interrupted'

export interface RunRecord {
  id: string
  repo: string
  task_path: string
  task_title: string | null
  source_ref: string
  base_branch: string
  task_branch: string
  status: RunStatus
  workspace_path: string
  created_at: string
  updated_at: string
  last_error: string | null
}

export interface RepoLock {
  repo: string
  run_id: string
  task_branch: string
  status: RunStatus
  locked_at: string
  updated_at: string
}

export interface RunEvent {
  id: number
  run_id: string
  type: string
  node_id: string | null
  role: string | null
  message: string
  payload: unknown
  created_at: string
}

export interface CodeReview {
  id: number
  run_id: string
  file_path: string
  status: 'approved' | 'rejected' | 'pending' | 'changes_requested'
  comment: string | null
  created_at: string
  updated_at: string
}

export interface TaskNode {
  id: string
  role: 'pm' | 'developer' | 'tester' | 'reviewer' | 'human_approval'
  prompt: string | null
  tools: string[]
}

export interface TaskEdge {
  from: string
  to: string
  condition: string | null
}

export interface TaskDefinition {
  path: string
  title: string
  baseBranch: string | null
  maxIterations: number | null
  nodeTimeout?: number
  nodes: TaskNode[]
  edges: TaskEdge[]
  roles: string[]
  hasHumanApproval: boolean
  valid: boolean
  validationErrors: string[]
  parseError: string | null
}

export interface TaskSummary {
  path: string
  title: string
  baseBranch: string | null
  maxIterations: number | null
  hasHumanApproval: boolean
  requireApproval: boolean
  acceptance: TaskAcceptanceConfig | null
  roles: string[]
  nodeCount: number
  edgeCount: number
  valid: boolean
  parseError: string | null
  validationErrors: string[]
}

export interface TaskAcceptanceConfig {
  commands: string[]
  timeout: number
  fail_fast: boolean
}

export interface TaskExecutorConfig {
  max_turns: number
  timeout: number
}

export interface TaskDefinitionV2 {
  path: string
  title: string
  description: string
  baseBranch: string
  require_approval: boolean
  acceptance: TaskAcceptanceConfig | null
  executor: TaskExecutorConfig | null
  valid: boolean
  validationErrors: string[]
  parseError: string | null
  version: 2
  hasHumanApproval: boolean
  nodeCount?: number
  edgeCount?: number
}

export interface WorkspaceInfo {
  repo: string
  path: string
  exists: boolean
  isGitRepo: boolean
  clean: boolean | null
  currentBranch: string | null
  currentCommit: string | null
  occupiedByAi: boolean
  activeRunId: string | null
  activeTaskBranch: string | null
}

export interface WorkspaceSnapshot {
  status: string
  diffStat: string
  currentBranch: string
  currentCommit: string
  trackedFiles: string[]
}

export interface EventPayload {
  type: string
  runId?: string
  repo?: string
  nodeId?: string | null
  role?: string | null
  status?: RunStatus | null
  message?: string
  payload?: unknown
  createdAt?: string
  taskPath?: string
  taskBranch?: string
  workspacePath?: string
}

export interface NodeOutput {
  nodeId: string
  role: string
  decision: string
  summary: string
  commitInfo: { commit: string, branch: string } | null
}
