/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { envInt, envStr } from './config.ts'

test('envStr normalizes numeric runtime config values', () => {
  assert.equal(envStr(1000, 'fallback'), '1000')
})

test('envStr trims string runtime config values', () => {
  assert.equal(envStr('  value  ', 'fallback'), 'value')
})

test('envInt accepts numeric runtime config values', () => {
  assert.equal(envInt(1800000, 120000), 1800000)
})
