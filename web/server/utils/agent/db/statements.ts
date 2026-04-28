import type { DatabaseSync } from 'node:sqlite'

export interface DbStatements {
  // runs
  insertRun: ReturnType<DatabaseSync['prepare']>
  updateRunStatus: ReturnType<DatabaseSync['prepare']>
  getRun: ReturnType<DatabaseSync['prepare']>
  listRuns: ReturnType<DatabaseSync['prepare']>
  listRunsPaged: ReturnType<DatabaseSync['prepare']>
  countRuns: ReturnType<DatabaseSync['prepare']>
  listRunsByStatus: ReturnType<DatabaseSync['prepare']>
  deleteRunEvents: ReturnType<DatabaseSync['prepare']>
  deleteRun: ReturnType<DatabaseSync['prepare']>

  // repo_locks
  listRepoLocks: ReturnType<DatabaseSync['prepare']>
  getActiveRepoLock: ReturnType<DatabaseSync['prepare']>
  upsertRepoLock: ReturnType<DatabaseSync['prepare']>
  deleteRepoLock: ReturnType<DatabaseSync['prepare']>

  // run_events
  insertRunEvent: ReturnType<DatabaseSync['prepare']>
  listRunEvents: ReturnType<DatabaseSync['prepare']>

  // code_reviews
  insertCodeReview: ReturnType<DatabaseSync['prepare']>
  updateCodeReview: ReturnType<DatabaseSync['prepare']>
  getCodeReview: ReturnType<DatabaseSync['prepare']>
  listCodeReviewsByRunId: ReturnType<DatabaseSync['prepare']>

  // run_workspaces
  insertRunWorkspace: ReturnType<DatabaseSync['prepare']>
  getRunWorkspace: ReturnType<DatabaseSync['prepare']>
  updateRunWorkspaceAccessed: ReturnType<DatabaseSync['prepare']>
  deleteRunWorkspace: ReturnType<DatabaseSync['prepare']>
  listOldRunWorkspaces: ReturnType<DatabaseSync['prepare']>

  // approval_states
  insertApprovalState: ReturnType<DatabaseSync['prepare']>
  getApprovalState: ReturnType<DatabaseSync['prepare']>
  deleteApprovalState: ReturnType<DatabaseSync['prepare']>

  // checkpoints
  upsertCheckpoint: ReturnType<DatabaseSync['prepare']>
  getCheckpoint: ReturnType<DatabaseSync['prepare']>
  deleteCheckpoint: ReturnType<DatabaseSync['prepare']>
}

export function createStatements(db: DatabaseSync): DbStatements {
  return {
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
    listRunsPaged: db.prepare(`
      SELECT * FROM runs
      WHERE (? IS NULL OR status = ?)
        AND (? IS NULL OR repo = ?)
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `),
    countRuns: db.prepare(`
      SELECT COUNT(*) AS total FROM runs
      WHERE (? IS NULL OR status = ?)
        AND (? IS NULL OR repo = ?)
    `),
    listRunsByStatus: db.prepare(`
      SELECT * FROM runs
      WHERE status = ?
      ORDER BY datetime(created_at) ASC
    `),
    deleteRunEvents: db.prepare('DELETE FROM run_events WHERE run_id = ?'),
    deleteRun: db.prepare(`
      DELETE FROM runs
      WHERE id = ?
        AND status IN ('completed', 'failed', 'cancelled', 'system_interrupted')
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
    insertApprovalState: db.prepare(`
      INSERT INTO approval_states (run_id, node_id, role, question, prior_outputs, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getApprovalState: db.prepare('SELECT * FROM approval_states WHERE run_id = ?'),
    deleteApprovalState: db.prepare('DELETE FROM approval_states WHERE run_id = ?'),
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
}
