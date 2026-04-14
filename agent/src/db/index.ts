import type { DatabaseSync } from 'node:sqlite'
import type { CodeReview, RepoLock, RunEvent, RunRecord, RunStatus } from '../types'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { DatabaseSync: DatabaseSyncClass } = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync }

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

export interface DbApi {
  db: DatabaseSync
  createRun: (run: {
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
  updateRunStatus: (id: string, status: RunStatus, lastError?: string | null) => RunRecord | null
  getRun: (id: string) => RunRecord | null
  listRuns: (limit?: number) => RunRecord[]
  listRunsByStatus: (status: RunStatus) => RunRecord[]
  listRepoLocks: () => RepoLock[]
  getActiveRepoLock: (repo: string) => RepoLock | null
  upsertRepoLock: (lock: {
    repo: string
    runId: string
    taskBranch: string
    status: RunStatus
    lockedAt: string
    updatedAt: string
  }) => RepoLock | null
  deleteRepoLock: (repo: string) => void
  appendRunEvent: (event: {
    runId: string
    type: string
    nodeId?: string | null
    role?: string | null
    message: string
    payload?: unknown
    createdAt?: string
  }) => RunEvent
  listRunEvents: (runId: string, limit?: number) => RunEvent[]
  createCodeReview: (runId: string, filePath: string, status: string, comment: string | null) => CodeReview
  updateCodeReview: (runId: string, filePath: string, status: string, comment: string | null) => CodeReview | null
  getCodeReview: (runId: string, filePath: string) => CodeReview | null
  listCodeReviewsByRunId: (runId: string) => CodeReview[]
  upsertCodeReview: (runId: string, filePath: string, status: string, comment: string | null) => CodeReview
  // Run workspaces
  createRunWorkspace: (workspace: { runId: string, repo: string, workspacePath: string }) => RunWorkspace
  getRunWorkspace: (runId: string) => RunWorkspace | null
  updateRunWorkspaceAccessed: (runId: string) => void
  deleteRunWorkspace: (runId: string) => void
  listOldRunWorkspaces: (before: string) => RunWorkspace[]
  // Approval states
  createApprovalState: (state: { runId: string, nodeId: string, role: string, question: string, priorOutputs: unknown }) => ApprovalState
  getApprovalState: (runId: string) => ApprovalState | null
  deleteApprovalState: (runId: string) => void
  // Checkpoints
  saveCheckpoint: (checkpoint: Omit<Checkpoint, 'created_at'>) => void
  getCheckpoint: (runId: string) => Checkpoint | null
  deleteCheckpoint: (runId: string) => void
}

export function createDb(dbPath: string): DbApi {
  const db = new DatabaseSyncClass(dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      task_path TEXT NOT NULL,
      task_title TEXT,
      source_ref TEXT NOT NULL,
      base_branch TEXT NOT NULL,
      task_branch TEXT NOT NULL,
      status TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_error TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS repo_locks (
      repo TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      task_branch TEXT NOT NULL,
      status TEXT NOT NULL,
      locked_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      node_id TEXT,
      role TEXT,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_run_events_run_id_created_at
    ON run_events(run_id, created_at);

    CREATE TABLE IF NOT EXISTS code_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT CHECK(status IN ('approved', 'rejected', 'pending', 'changes_requested')),
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_code_reviews_run_id
    ON code_reviews(run_id);

    CREATE INDEX IF NOT EXISTS idx_code_reviews_file_path
    ON code_reviews(file_path);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_code_reviews_run_id_file_path
    ON code_reviews(run_id, file_path);

    CREATE TABLE IF NOT EXISTS run_workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      repo TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accessed_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_run_workspaces_repo
    ON run_workspaces(repo);

    CREATE INDEX IF NOT EXISTS idx_run_workspaces_accessed_at
    ON run_workspaces(accessed_at);

    CREATE TABLE IF NOT EXISTS approval_states (
      run_id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      role TEXT NOT NULL,
      question TEXT NOT NULL,
      prior_outputs TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS checkpoints (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL,
      parent_checkpoint_id TEXT,
      checkpoint TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id
    ON checkpoints(thread_id, checkpoint_ns);
  `)

  const statements = {
    insertRun: db.prepare(`
      INSERT INTO runs (
        id, repo, task_path, task_title, source_ref, base_branch, task_branch,
        status, workspace_path, created_at, updated_at, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateRunStatus: db.prepare(`
      UPDATE runs
      SET status = ?, updated_at = ?, last_error = ?
      WHERE id = ?
    `),
    getRun: db.prepare('SELECT * FROM runs WHERE id = ?'),
    listRuns: db.prepare(`
      SELECT * FROM runs
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `),
    listRunsByStatus: db.prepare(`
      SELECT * FROM runs
      WHERE status = ?
      ORDER BY datetime(created_at) ASC
    `),
    listRepoLocks: db.prepare(`
      SELECT * FROM repo_locks
      ORDER BY datetime(updated_at) DESC
    `),
    getActiveRepoLock: db.prepare('SELECT * FROM repo_locks WHERE repo = ?'),
    upsertRepoLock: db.prepare(`
      INSERT INTO repo_locks (repo, run_id, task_branch, status, locked_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo) DO UPDATE SET
        run_id = excluded.run_id,
        task_branch = excluded.task_branch,
        status = excluded.status,
        updated_at = excluded.updated_at
    `),
    deleteRepoLock: db.prepare('DELETE FROM repo_locks WHERE repo = ?'),
    insertRunEvent: db.prepare(`
      INSERT INTO run_events (run_id, type, node_id, role, message, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `),
    listRunEvents: db.prepare(`
      SELECT * FROM run_events
      WHERE run_id = ?
      ORDER BY id DESC
      LIMIT ?
    `),
    insertCodeReview: db.prepare(`
      INSERT INTO code_reviews (run_id, file_path, status, comment, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `),
    updateCodeReview: db.prepare(`
      UPDATE code_reviews
      SET status = ?, comment = ?, updated_at = ?
      WHERE run_id = ? AND file_path = ?
    `),
    getCodeReview: db.prepare(`
      SELECT * FROM code_reviews WHERE run_id = ? AND file_path = ?
    `),
    listCodeReviewsByRunId: db.prepare(`
      SELECT * FROM code_reviews WHERE run_id = ? ORDER BY file_path
    `),
    // Run workspaces
    insertRunWorkspace: db.prepare(`
      INSERT INTO run_workspaces (run_id, repo, workspace_path, created_at, accessed_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getRunWorkspace: db.prepare('SELECT * FROM run_workspaces WHERE run_id = ?'),
    updateRunWorkspaceAccessed: db.prepare(`
      UPDATE run_workspaces SET accessed_at = ? WHERE run_id = ?
    `),
    deleteRunWorkspace: db.prepare('DELETE FROM run_workspaces WHERE run_id = ?'),
    listOldRunWorkspaces: db.prepare(`
      SELECT * FROM run_workspaces
      WHERE accessed_at < ?
      ORDER BY accessed_at ASC
    `),
    // Approval states
    insertApprovalState: db.prepare(`
      INSERT INTO approval_states (run_id, node_id, role, question, prior_outputs, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getApprovalState: db.prepare('SELECT * FROM approval_states WHERE run_id = ?'),
    deleteApprovalState: db.prepare('DELETE FROM approval_states WHERE run_id = ?'),
    // Checkpoints
    upsertCheckpoint: db.prepare(`
      INSERT INTO checkpoints (run_id, thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        checkpoint_ns = excluded.checkpoint_ns,
        checkpoint_id = excluded.checkpoint_id,
        parent_checkpoint_id = excluded.parent_checkpoint_id,
        checkpoint = excluded.checkpoint,
        metadata = excluded.metadata,
        created_at = excluded.created_at
    `),
    getCheckpoint: db.prepare('SELECT * FROM checkpoints WHERE run_id = ?'),
    deleteCheckpoint: db.prepare('DELETE FROM checkpoints WHERE run_id = ?'),
  }

  function createRun(run: {
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
    statements.insertRun.run(
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

  function updateRunStatus(id: string, status: RunStatus, lastError: string | null = null) {
    const updatedAt = new Date().toISOString()
    statements.updateRunStatus.run(status, updatedAt, lastError, id)
    return getRun(id)
  }

  function getRun(id: string): RunRecord | null {
    return (statements.getRun.get(id) as unknown as RunRecord | undefined) || null
  }

  function listRuns(limit = 50): RunRecord[] {
    return statements.listRuns.all(limit) as unknown as unknown as RunRecord[]
  }

  function listRunsByStatus(status: RunStatus): RunRecord[] {
    return statements.listRunsByStatus.all(status) as unknown as unknown as RunRecord[]
  }

  function listRepoLocks(): RepoLock[] {
    return statements.listRepoLocks.all() as unknown as unknown as RepoLock[]
  }

  function getActiveRepoLock(repo: string): RepoLock | null {
    return (statements.getActiveRepoLock.get(repo) as unknown as RepoLock | undefined) || null
  }

  function upsertRepoLock(lock: {
    repo: string
    runId: string
    taskBranch: string
    status: RunStatus
    lockedAt: string
    updatedAt: string
  }) {
    statements.upsertRepoLock.run(
      lock.repo,
      lock.runId,
      lock.taskBranch,
      lock.status,
      lock.lockedAt,
      lock.updatedAt,
    )
    return getActiveRepoLock(lock.repo)
  }

  function deleteRepoLock(repo: string) {
    statements.deleteRepoLock.run(repo)
  }

  function appendRunEvent(event: {
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
    const inserted = statements.insertRunEvent.get(
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
      payload: event.payload || null,
      created_at: createdAt,
    }
  }

  function listRunEvents(runId: string, limit = 200): RunEvent[] {
    const rows = statements.listRunEvents.all(runId, limit) as unknown as Array<RunEvent & { payload: string | null }>
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

  function createCodeReview(runId: string, filePath: string, status: string, comment: string | null): CodeReview {
    const now = new Date().toISOString()
    const result = statements.insertCodeReview.get(runId, filePath, status, comment, now, now) as { id: number }
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

  function updateCodeReview(runId: string, filePath: string, status: string, comment: string | null): CodeReview | null {
    const now = new Date().toISOString()
    statements.updateCodeReview.run(status, comment, now, runId, filePath)
    return getCodeReview(runId, filePath)
  }

  function getCodeReview(runId: string, filePath: string): CodeReview | null {
    return (statements.getCodeReview.get(runId, filePath) as unknown as CodeReview | undefined) || null
  }

  function listCodeReviewsByRunId(runId: string): CodeReview[] {
    return statements.listCodeReviewsByRunId.all(runId) as unknown as unknown as CodeReview[]
  }

  function upsertCodeReview(runId: string, filePath: string, status: string, comment: string | null): CodeReview {
    const existing = getCodeReview(runId, filePath)
    if (existing) {
      return updateCodeReview(runId, filePath, status, comment)!
    }
    return createCodeReview(runId, filePath, status, comment)
  }

  // Run workspaces
  function createRunWorkspace(workspace: { runId: string, repo: string, workspacePath: string }): RunWorkspace {
    const now = new Date().toISOString()
    statements.insertRunWorkspace.run(workspace.runId, workspace.repo, workspace.workspacePath, now, now)
    return {
      id: 0, // Will be populated on fetch
      run_id: workspace.runId,
      repo: workspace.repo,
      workspace_path: workspace.workspacePath,
      created_at: now,
      accessed_at: now,
    }
  }

  function getRunWorkspace(runId: string): RunWorkspace | null {
    return (statements.getRunWorkspace.get(runId) as unknown as RunWorkspace | undefined) || null
  }

  function updateRunWorkspaceAccessed(runId: string) {
    statements.updateRunWorkspaceAccessed.run(new Date().toISOString(), runId)
  }

  function deleteRunWorkspace(runId: string) {
    statements.deleteRunWorkspace.run(runId)
  }

  function listOldRunWorkspaces(before: string): RunWorkspace[] {
    return statements.listOldRunWorkspaces.all(before) as unknown as RunWorkspace[]
  }

  // Approval states
  function createApprovalState(state: { runId: string, nodeId: string, role: string, question: string, priorOutputs: unknown }): ApprovalState {
    const now = new Date().toISOString()
    const priorOutputs = JSON.stringify(state.priorOutputs)
    statements.insertApprovalState.run(state.runId, state.nodeId, state.role, state.question, priorOutputs, now)
    return {
      run_id: state.runId,
      node_id: state.nodeId,
      role: state.role,
      question: state.question,
      prior_outputs: priorOutputs,
      created_at: now,
    }
  }

  function getApprovalState(runId: string): ApprovalState | null {
    return (statements.getApprovalState.get(runId) as unknown as ApprovalState | undefined) || null
  }

  function deleteApprovalState(runId: string) {
    statements.deleteApprovalState.run(runId)
  }

  // Checkpoints
  function saveCheckpoint(checkpoint: Omit<Checkpoint, 'created_at'>) {
    statements.upsertCheckpoint.run(
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

  function getCheckpoint(runId: string): Checkpoint | null {
    return (statements.getCheckpoint.get(runId) as unknown as Checkpoint | undefined) || null
  }

  function deleteCheckpoint(runId: string) {
    statements.deleteCheckpoint.run(runId)
  }

  return {
    db,
    createRun,
    updateRunStatus,
    getRun,
    listRuns,
    listRunsByStatus,
    listRepoLocks,
    getActiveRepoLock,
    upsertRepoLock,
    deleteRepoLock,
    appendRunEvent,
    listRunEvents,
    createCodeReview,
    updateCodeReview,
    getCodeReview,
    listCodeReviewsByRunId,
    upsertCodeReview,
    createRunWorkspace,
    getRunWorkspace,
    updateRunWorkspaceAccessed,
    deleteRunWorkspace,
    listOldRunWorkspaces,
    createApprovalState,
    getApprovalState,
    deleteApprovalState,
    saveCheckpoint,
    getCheckpoint,
    deleteCheckpoint,
  }
}
