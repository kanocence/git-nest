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

// AI types — imported from shared types with backward-compatible Ai* aliases
import type {
  TaskAcceptanceConfig,
  TaskExecutorConfig,
  TaskSummary,
  TaskListResponse,
  RunRecord,
  RunListResponse,
  WorkspaceStateResponse,
} from '#shared/types/agent'

export type AiTaskAcceptanceConfig = TaskAcceptanceConfig
export type AiTaskExecutorConfig = TaskExecutorConfig
export type AiTaskSummary = TaskSummary
export type AiTaskListResponse = TaskListResponse
export type AiRunRecord = RunRecord
export type AiRunListResponse = RunListResponse
export type AiWorkspaceState = WorkspaceStateResponse

// Frontend-specific RunEvent with relaxed payload for UI property access
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

export interface AiRunDetailResponse {
  run: AiRunRecord
  events: AiRunEvent[]
  workspace: AiWorkspaceState
}
