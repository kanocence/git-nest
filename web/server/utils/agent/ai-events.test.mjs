/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('#shared/')) {
      const sharedPath = path.resolve('shared', `${specifier.slice('#shared/'.length)}.ts`)
      return nextResolve(pathToFileURL(sharedPath).href, context)
    }
    return nextResolve(specifier, context)
  },
})

const {
  getHermesOutputText,
  isHermesOutputEvent,
  shouldRefreshAiState,
  summarizeUiEvents,
  toUiEvent,
} = await import('#shared/utils/ai-events')

test('toUiEvent derives useful messages for common run events', () => {
  assert.equal(toUiEvent({ type: 'run.queued' }).message, 'Run queued')
  assert.equal(toUiEvent({ type: 'run.executor_progress', message: 'turn 1' }, true).isLive, true)
  assert.equal(toUiEvent({ type: 'run.failed', error: 'timeout' }).message, 'Run failed: timeout')
})

test('summarizeUiEvents reports latest status and noisy event counts', () => {
  const events = [
    toUiEvent({ type: 'run.started', message: 'Run execution started', created_at: '2026-04-29T01:00:00.000Z' }),
    toUiEvent({ type: 'run.executor_progress', message: 'chunk 1', created_at: '2026-04-29T01:00:01.000Z' }),
    toUiEvent({ type: 'run.executor_progress', message: 'chunk 2', created_at: '2026-04-29T01:00:02.000Z' }),
    toUiEvent({ type: 'run.executor_heartbeat', created_at: '2026-04-29T01:00:02.500Z' }),
    toUiEvent({ type: 'run.waiting_approval', created_at: '2026-04-29T01:00:03.000Z' }),
  ]

  const summary = summarizeUiEvents(events)

  assert.equal(summary.total, 5)
  assert.equal(summary.status, 'Waiting for approval')
  assert.equal(summary.tone, 'warning')
  assert.equal(summary.executorEventCount, 3)
  assert.equal(summary.latestMessage, 'Run waiting for approval')
})

test('shouldRefreshAiState only matches state-changing events', () => {
  assert.equal(shouldRefreshAiState('run.executor_progress'), false)
  assert.equal(shouldRefreshAiState('run.waiting_continuation'), true)
  assert.equal(shouldRefreshAiState('run.completed'), true)
})

test('getHermesOutputText preserves persisted executor output', () => {
  const events = [
    toUiEvent({ type: 'run.started', message: 'Run started', created_at: '2026-04-29T01:00:00.000Z' }),
    toUiEvent({ type: 'run.executor_progress', message: 'line 1\n', created_at: '2026-04-29T01:00:01.000Z' }),
    toUiEvent({ type: 'run.executor_heartbeat', message: 'Executor still running (10s)', created_at: '2026-04-29T01:00:02.000Z' }),
    toUiEvent({ type: 'run.executor_progress', message: 'line 2\n', created_at: '2026-04-29T01:00:03.000Z' }),
  ]

  assert.equal(isHermesOutputEvent(events[1]), true)
  assert.equal(isHermesOutputEvent(events[2]), false)
  assert.equal(getHermesOutputText(events), 'line 1\nline 2\n')
})
