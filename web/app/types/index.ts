// Types for git-runner API responses

export interface RepoInfo {
  name: string
  path: string
  lastModified: string
  headBranch?: string
}

export interface RepoListResponse {
  repos: RepoInfo[]
  total: number
}

export interface CommitInfo {
  hash: string
  shortHash: string
  author: string
  date: string
  message: string
}

export interface CommitLogResponse {
  repo: string
  commits: CommitInfo[]
  total: number
  branch?: string
}

export interface RepoCreateRequest {
  name: string
}

export interface ApiErrorResponse {
  error: string
  code: string
}

export interface AiTaskAcceptanceConfig {
  commands: string[]
  timeout: number
  fail_fast: boolean
}

export interface AiTaskExecutorConfig {
  max_turns: number
  timeout: number
  max_continuations?: number
}

export interface AiTaskSummary {
  path: string
  title: string
  baseBranch: string | null
  maxIterations: number | null
  hasHumanApproval: boolean
  requireApproval: boolean
  acceptance: AiTaskAcceptanceConfig | null
  executor: AiTaskExecutorConfig | null
  roles: string[]
  nodeCount: number
  edgeCount: number
  valid: boolean
  parseError: string | null
  validationErrors: string[]
}

export interface AiTaskListResponse {
  repo: string
  ref: string
  tasks: AiTaskSummary[]
  total: number
}

export interface AiWorkspaceState {
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
  lockStatus: string | null
  lockUpdatedAt: string | null
}

export interface AiRunRecord {
  id: string
  repo: string
  task_path: string
  task_title: string | null
  source_ref: string
  base_branch: string
  task_branch: string
  status: string
  workspace_path: string
  max_iterations: number | null
  current_iteration: number | null
  created_at: string
  updated_at: string
  last_error: string | null
}

export interface AiRunEvent {
  id: number
  run_id: string
  type: string
  node_id: string | null
  role: string | null
  message: string
  payload: Record<string, any> | null
  created_at: string
}

export interface AiRunListResponse {
  runs: AiRunRecord[]
  total: number
}

export interface AiRunDetailResponse {
  run: AiRunRecord
  events: AiRunEvent[]
  workspace: AiWorkspaceState
}
