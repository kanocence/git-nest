/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createEventRepository, createRunRepository } from './repository.ts'
import { initSchema } from './schema.ts'
import { createStatements } from './statements.ts'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

test('append preserves falsey event payloads for live subscribers', () => {
  const db = new DatabaseSync(':memory:')
  initSchema(db)
  const events = createEventRepository(db, createStatements(db))

  assert.equal(events.append({ runId: 'run-1', type: 'test.false', message: 'false', payload: false }).payload, false)
  assert.equal(events.append({ runId: 'run-1', type: 'test.zero', message: 'zero', payload: 0 }).payload, 0)
  assert.equal(events.append({ runId: 'run-1', type: 'test.empty', message: 'empty', payload: '' }).payload, '')
})

function createRun(runs, id, status = 'completed', repo = 'demo') {
  const day = Number(id.replace('run-', '')) || 1
  const timestamp = new Date(Date.UTC(2026, 0, day)).toISOString()
  runs.create({
    id,
    repo,
    taskPath: `.git-nest/tasks/${id}.yaml`,
    taskTitle: id,
    sourceRef: 'main',
    baseBranch: 'main',
    taskBranch: `ai/${id}`,
    status,
    workspacePath: `/tmp/${id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  })
}

test('runs list supports limit offset status repo and total', () => {
  const db = new DatabaseSync(':memory:')
  initSchema(db)
  const runs = createRunRepository(db, createStatements(db))
  createRun(runs, 'run-1', 'completed', 'demo')
  createRun(runs, 'run-2', 'running', 'demo')
  createRun(runs, 'run-3', 'completed', 'other')

  const page = runs.list({ limit: 1, offset: 0, status: 'completed', repo: 'demo' })

  assert.equal(page.total, 1)
  assert.equal(page.runs.length, 1)
  assert.equal(page.runs[0].id, 'run-1')
})

test('runs list supports multiple statuses with repo filtering and pagination', () => {
  const db = new DatabaseSync(':memory:')
  initSchema(db)
  const runs = createRunRepository(db, createStatements(db))
  createRun(runs, 'run-1', 'completed', 'demo')
  createRun(runs, 'run-2', 'running', 'demo')
  createRun(runs, 'run-3', 'waiting_approval', 'demo')
  createRun(runs, 'run-4', 'failed', 'demo')
  createRun(runs, 'run-5', 'running', 'other')

  const page = runs.list({
    limit: 2,
    offset: 0,
    statuses: ['running', 'waiting_approval'],
    repo: 'demo',
  })

  assert.equal(page.total, 2)
  assert.deepEqual(page.runs.map(run => run.id), ['run-3', 'run-2'])
})

test('delete removes terminal runs and rejects active runs', () => {
  const db = new DatabaseSync(':memory:')
  initSchema(db)
  const statements = createStatements(db)
  const runs = createRunRepository(db, statements)
  const events = createEventRepository(db, statements)
  createRun(runs, 'run-1', 'completed', 'demo')
  createRun(runs, 'run-2', 'running', 'demo')
  events.append({ runId: 'run-1', type: 'run.executor_progress', message: 'persisted log' })

  assert.equal(runs.delete('run-1'), true)
  assert.equal(runs.get('run-1'), null)
  assert.deepEqual(events.listByRun('run-1'), [])
  assert.equal(runs.delete('run-2'), false)
  assert.notEqual(runs.get('run-2'), null)
})
