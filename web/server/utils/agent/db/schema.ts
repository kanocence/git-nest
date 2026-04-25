export function initSchema(db: { exec: (sql: string) => void }): void {
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
}
