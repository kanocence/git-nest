import type { DatabaseSync } from 'node:sqlite'
import type {
  CodeReview,
  RepoLock,
  RunEvent,
  RunRecord,
  RunStatus,
} from '#shared/types/agent'
import type { DbStatements } from './statements'

export interface RunWorkspace {
  id: number
  run_id: string
  repo: string
  workspace_path: string
  created_at: string
  accessed_at: string
}

export interface ApprovalState {
  run_id: string
  node_id: string
  role: string
  question: string
  prior_outputs: string
  created_at: string
}

export interface Checkpoint {
  run_id: string
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_checkpoint_id: string | null
  checkpoint: string
  metadata: string | null
  created_at: string
}

export interface RunRepository {
  create: (run: {
    id: string
    repo: string
    taskPath: string
    taskTitle: string | null
    sourceRef: string
    baseBranch: string
    taskBranch: string
    status: RunStatus
    workspacePath: string
    createdAt: string
    updatedAt: string
    lastError: string | null
  }) => typeof run
  updateStatus: (id: string, status: RunStatus, lastError?: string | null) => RunRecord | null
  get: (id: string) => RunRecord | null
  list: (limit?: number) => RunRecord[]
  listByStatus: (status: RunStatus) => RunRecord[]
}

export interface EventRepository {
  append: (event: {
    runId: string
    type: string
    nodeId?: string | null
    role?: string | null
    message: string
    payload?: unknown
    createdAt?: string
  }) => RunEvent
  listByRun: (runId: string, limit?: number) => RunEvent[]
}

export interface LockRepository {
  list: () => RepoLock[]
  get: (repo: string) => RepoLock | null
  upsert: (lock: {
    repo: string
    runId: string
    taskBranch: string
    status: RunStatus
    lockedAt: string
    updatedAt: string
  }) => RepoLock | null
  delete: (repo: string) => void
}

export interface CodeReviewRepository {
  create: (runId: string, filePath: string, status: string, comment: string | null) => CodeReview
  update: (runId: string, filePath: string, status: string, comment: string | null) => CodeReview | null
  get: (runId: string, filePath: string) => CodeReview | null
  listByRunId: (runId: string) => CodeReview[]
  upsert: (runId: string, filePath: string, status: string, comment: string | null) => CodeReview
}

export interface RunWorkspaceRepository {
  create: (workspace: { runId: string, repo: string, workspacePath: string }) => RunWorkspace
  get: (runId: string) => RunWorkspace | null
  updateAccessed: (runId: string) => void
  delete: (runId: string) => void
  listOld: (before: string) => RunWorkspace[]
}

export interface ApprovalStateRepository {
  create: (state: { runId: string, nodeId: string, role: string, question: string, priorOutputs: unknown }) => ApprovalState
  get: (runId: string) => ApprovalState | null
  delete: (runId: string) => void
}

export interface CheckpointRepository {
  save: (checkpoint: Omit<Checkpoint, 'created_at'>) => void
  get: (runId: string) => Checkpoint | null
  delete: (runId: string) => void
}

export function createRunRepository(_db: DatabaseSync, s: DbStatements): RunRepository {
  function create(run: {
    id: string
    repo: string
    taskPath: string
    taskTitle: string | null
    sourceRef: string
    baseBranch: string
    taskBranch: string
    status: RunStatus
    workspacePath: string
    createdAt: string
    updatedAt: string
    lastError: string | null
  }) {
    s.insertRun.run(
      run.id,
      run.repo,
      run.taskPath,
      run.taskTitle,
      run.sourceRef,
      run.baseBranch,
      run.taskBranch,
      run.status,
      run.workspacePath,
      run.createdAt,
      run.updatedAt,
      run.lastError,
    )
    return run
  }

  function updateStatus(id: string, status: RunStatus, lastError: string | null = null) {
    const updatedAt = new Date().toISOString()
    s.updateRunStatus.run(status, updatedAt, lastError, id)
    return get(id)
  }

  function get(id: string): RunRecord | null {
    return (s.getRun.get(id) as unknown as RunRecord | undefined) || null
  }

  function list(limit = 50): RunRecord[] {
    return s.listRuns.all(limit) as unknown as RunRecord[]
  }

  function listByStatus(status: RunStatus): RunRecord[] {
    return s.listRunsByStatus.all(status) as unknown as RunRecord[]
  }

  return { create, updateStatus, get, list, listByStatus }
}

export function createEventRepository(_db: DatabaseSync, s: DbStatements): EventRepository {
  function append(event: {
    runId: string
    type: string
    nodeId?: string | null
    role?: string | null
    message: string
    payload?: unknown
    createdAt?: string
  }): RunEvent {
    const createdAt = event.createdAt || new Date().toISOString()
    const payload = event.payload === undefined || event.payload === null
      ? null
      : JSON.stringify(event.payload)
    const inserted = s.insertRunEvent.get(
      event.runId,
      event.type,
      event.nodeId || null,
      event.role || null,
      event.message,
      payload,
      createdAt,
    ) as unknown as { id: number }

    return {
      id: inserted.id,
      run_id: event.runId,
      type: event.type,
      node_id: event.nodeId || null,
      role: event.role || null,
      message: event.message,
      payload: event.payload ?? null,
      created_at: createdAt,
    }
  }

  function listByRun(runId: string, limit = 200): RunEvent[] {
    const rows = s.listRunEvents.all(runId, limit) as unknown as Array<RunEvent & { payload: string | null }>
    return rows
      .reverse()
      .map((raw) => {
        let parsedPayload: unknown = null
        if (raw.payload) {
          try {
            parsedPayload = JSON.parse(raw.payload)
          }
          catch {
            parsedPayload = { raw: raw.payload }
          }
        }

        return {
          ...raw,
          payload: parsedPayload,
        }
      })
  }

  return { append, listByRun }
}

export function createLockRepository(_db: DatabaseSync, s: DbStatements): LockRepository {
  function list(): RepoLock[] {
    return s.listRepoLocks.all() as unknown as RepoLock[]
  }

  function get(repo: string): RepoLock | null {
    return (s.getActiveRepoLock.get(repo) as unknown as RepoLock | undefined) || null
  }

  function upsert(lock: {
    repo: string
    runId: string
    taskBranch: string
    status: RunStatus
    lockedAt: string
    updatedAt: string
  }) {
    s.upsertRepoLock.run(
      lock.repo,
      lock.runId,
      lock.taskBranch,
      lock.status,
      lock.lockedAt,
      lock.updatedAt,
    )
    return get(lock.repo)
  }

  function deleteLock(repo: string) {
    s.deleteRepoLock.run(repo)
  }

  return { list, get, upsert, delete: deleteLock }
}

export function createCodeReviewRepository(_db: DatabaseSync, s: DbStatements): CodeReviewRepository {
  function create(runId: string, filePath: string, status: string, comment: string | null): CodeReview {
    const now = new Date().toISOString()
    const result = s.insertCodeReview.get(runId, filePath, status, comment, now, now) as unknown as { id: number }
    return {
      id: result.id,
      run_id: runId,
      file_path: filePath,
      status: status as CodeReview['status'],
      comment,
      created_at: now,
      updated_at: now,
    }
  }

  function update(runId: string, filePath: string, status: string, comment: string | null): CodeReview | null {
    const now = new Date().toISOString()
    s.updateCodeReview.run(status, comment, now, runId, filePath)
    return get(runId, filePath)
  }

  function get(runId: string, filePath: string): CodeReview | null {
    return (s.getCodeReview.get(runId, filePath) as unknown as CodeReview | undefined) || null
  }

  function listByRunId(runId: string): CodeReview[] {
    return s.listCodeReviewsByRunId.all(runId) as unknown as CodeReview[]
  }

  function upsert(runId: string, filePath: string, status: string, comment: string | null): CodeReview {
    const existing = get(runId, filePath)
    if (existing) {
      return update(runId, filePath, status, comment)!
    }
    return create(runId, filePath, status, comment)
  }

  return { create, update, get, listByRunId, upsert }
}

export function createRunWorkspaceRepository(_db: DatabaseSync, s: DbStatements): RunWorkspaceRepository {
  function create(workspace: { runId: string, repo: string, workspacePath: string }): RunWorkspace {
    const now = new Date().toISOString()
    s.insertRunWorkspace.run(workspace.runId, workspace.repo, workspace.workspacePath, now, now)
    return {
      id: 0,
      run_id: workspace.runId,
      repo: workspace.repo,
      workspace_path: workspace.workspacePath,
      created_at: now,
      accessed_at: now,
    }
  }

  function get(runId: string): RunWorkspace | null {
    return (s.getRunWorkspace.get(runId) as unknown as RunWorkspace | undefined) || null
  }

  function updateAccessed(runId: string) {
    s.updateRunWorkspaceAccessed.run(new Date().toISOString(), runId)
  }

  function deleteWorkspace(runId: string) {
    s.deleteRunWorkspace.run(runId)
  }

  function listOld(before: string): RunWorkspace[] {
    return s.listOldRunWorkspaces.all(before) as unknown as RunWorkspace[]
  }

  return { create, get, updateAccessed, delete: deleteWorkspace, listOld }
}

export function createApprovalStateRepository(_db: DatabaseSync, s: DbStatements): ApprovalStateRepository {
  function create(state: { runId: string, nodeId: string, role: string, question: string, priorOutputs: unknown }): ApprovalState {
    const now = new Date().toISOString()
    const priorOutputs = JSON.stringify(state.priorOutputs)
    s.insertApprovalState.run(state.runId, state.nodeId, state.role, state.question, priorOutputs, now)
    return {
      run_id: state.runId,
      node_id: state.nodeId,
      role: state.role,
      question: state.question,
      prior_outputs: priorOutputs,
      created_at: now,
    }
  }

  function get(runId: string): ApprovalState | null {
    return (s.getApprovalState.get(runId) as unknown as ApprovalState | undefined) || null
  }

  function deleteState(runId: string) {
    s.deleteApprovalState.run(runId)
  }

  return { create, get, delete: deleteState }
}

export function createCheckpointRepository(_db: DatabaseSync, s: DbStatements): CheckpointRepository {
  function save(checkpoint: Omit<Checkpoint, 'created_at'>) {
    s.upsertCheckpoint.run(
      checkpoint.run_id,
      checkpoint.thread_id,
      checkpoint.checkpoint_ns,
      checkpoint.checkpoint_id,
      checkpoint.parent_checkpoint_id,
      checkpoint.checkpoint,
      checkpoint.metadata,
      new Date().toISOString(),
    )
  }

  function get(runId: string): Checkpoint | null {
    return (s.getCheckpoint.get(runId) as unknown as Checkpoint | undefined) || null
  }

  function deleteCheckpoint(runId: string) {
    s.deleteCheckpoint.run(runId)
  }

  return { save, get, delete: deleteCheckpoint }
}
