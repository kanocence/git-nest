import { mkdtempSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const { DatabaseSync: DatabaseSyncClass } = require('node:sqlite')

const tmpDir = mkdtempSync(join(tmpdir(), 'agent-db-smoke-'))
const DB_PATH = process.env.AGENT_DB_PATH || join(tmpDir, 'test.db')

const SCHEMA_SQL = `
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
`

let passed = 0
let failed = 0

function assert(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`)
    passed++
  }
  else {
    console.log(`  FAIL: ${name}`)
    failed++
  }
}

function section(title) {
  console.log(`\n${title}`)
}

console.log(`Agent DB Smoke Check`)
console.log(`Database: ${DB_PATH}`)

const db = new DatabaseSyncClass(DB_PATH)

// 1. Schema init
section('1. Schema Initialization')
db.exec(SCHEMA_SQL)
assert('WAL mode enabled', db.prepare('PRAGMA journal_mode').get().journal_mode === 'wal')
assert('Foreign keys enabled', db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1)

// 2. Run CRUD
section('2. Run CRUD')

const insertRun = db.prepare(`
  INSERT INTO runs (id, repo, task_path, task_title, source_ref, base_branch, task_branch, status, workspace_path, created_at, updated_at, last_error)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const now = new Date().toISOString()
insertRun.run('run-001', 'test-repo', '.git-nest/tasks/test.yaml', 'Test Task', 'main', 'main', 'task/run-001', 'queued', '/tmp/ws/run-001', now, now, null)

const getRun = db.prepare('SELECT * FROM runs WHERE id = ?')
const run = getRun.get('run-001')
assert('Create run', run !== undefined)
assert('Run id matches', run.id === 'run-001')
assert('Run repo matches', run.repo === 'test-repo')
assert('Run status is queued', run.status === 'queued')

const updateRun = db.prepare(`UPDATE runs SET status = ?, updated_at = ?, last_error = ? WHERE id = ?`)
const updatedAt = new Date().toISOString()
updateRun.run('running', updatedAt, null, 'run-001')
const updatedRun = getRun.get('run-001')
assert('Update status to running', updatedRun.status === 'running')

const listRuns = db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?')
const runs = listRuns.all(10)
assert('List runs returns array', Array.isArray(runs))
assert('List runs has 1 item', runs.length === 1)

// 3. Event append and list
section('3. Event Append and List')

const insertEvent = db.prepare(`
  INSERT INTO run_events (run_id, type, node_id, role, message, payload, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING id
`)

const event1 = insertEvent.get('run-001', 'status', null, null, 'Run started', null, now)
assert('Append event returns id', event1.id !== undefined)

const payload = JSON.stringify({ nodeId: 'node-1', output: 'hello' })
const event2 = insertEvent.get('run-001', 'output', 'node-1', 'developer', 'Output message', payload, now)
assert('Append event with payload', event2.id !== undefined)

const listEvents = db.prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY id DESC LIMIT ?')
const events = listEvents.all('run-001', 10)
assert('List events returns array', Array.isArray(events))
assert('List events has 2 items', events.length === 2)
assert('Event payload stored', events[0].payload !== null)

const parsedPayload = JSON.parse(events[0].payload)
assert('Payload JSON roundtrip', parsedPayload.nodeId === 'node-1')

// 4. Repo Lock upsert/delete
section('4. Repo Lock Upsert and Delete')

const upsertLock = db.prepare(`
  INSERT INTO repo_locks (repo, run_id, task_branch, status, locked_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(repo) DO UPDATE SET
    run_id = excluded.run_id,
    task_branch = excluded.task_branch,
    status = excluded.status,
    updated_at = excluded.updated_at
`)

upsertLock.run('test-repo', 'run-001', 'task/run-001', 'running', now, now)

const getLock = db.prepare('SELECT * FROM repo_locks WHERE repo = ?')
const lock = getLock.get('test-repo')
assert('Upsert lock', lock !== undefined)
assert('Lock repo matches', lock.repo === 'test-repo')
assert('Lock run_id matches', lock.run_id === 'run-001')

upsertLock.run('test-repo', 'run-002', 'task/run-002', 'queued', now, now)
const updatedLock = getLock.get('test-repo')
assert('Upsert updates existing lock', updatedLock.run_id === 'run-002')
assert('Upsert updates status', updatedLock.status === 'queued')

const deleteLock = db.prepare('DELETE FROM repo_locks WHERE repo = ?')
deleteLock.run('test-repo')
const deletedLock = getLock.get('test-repo')
assert('Delete lock', deletedLock === undefined)

// Summary
section('Summary')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)

if (failed > 0) {
  process.exit(1)
}

console.log('\nAll checks passed!')

// Cleanup
try {
  unlinkSync(DB_PATH)
}
catch { /* ignore */ }
