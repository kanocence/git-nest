/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createEventRepository } from './repository.ts'
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
