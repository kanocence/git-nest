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
}

export interface RepoCreateRequest {
  name: string
}

export interface ApiErrorResponse {
  error: string
  code: string
}
