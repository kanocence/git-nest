import type { DbApi } from '../../src/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestRun } from '../helpers/factory'
import { closeTestDb, createTestDb, resetTestDb } from '../helpers/test-db'

describe('database Operations', () => {
  let db: DbApi

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    closeTestDb(db)
  })

  describe('run Operations', () => {
    it('should create and retrieve a run', () => {
      const runData = createTestRun({ id: 'test-run-1' })

      db.createRun({
        id: runData.id,
        repo: runData.repo,
        taskPath: runData.task_path,
        taskTitle: runData.task_title,
        sourceRef: runData.source_ref,
        baseBranch: runData.base_branch,
        taskBranch: runData.task_branch,
        status: runData.status,
        workspacePath: runData.workspace_path,
        createdAt: runData.created_at,
        updatedAt: runData.updated_at,
        lastError: runData.last_error,
      })

      const retrieved = db.getRun('test-run-1')
      expect(retrieved).not.toBeNull()
      expect(retrieved?.id).toBe('test-run-1')
      expect(retrieved?.repo).toBe('test-repo')
    })

    it('should return null for non-existent run', () => {
      const retrieved = db.getRun('non-existent')
      expect(retrieved).toBeNull()
    })

    it('should list runs ordered by creation time', () => {
      const run1 = createTestRun({ id: 'run-1', created_at: '2024-01-01T00:00:00Z' })
      const run2 = createTestRun({ id: 'run-2', created_at: '2024-01-02T00:00:00Z' })

      db.createRun({ ...run1, taskPath: run1.task_path, taskTitle: run1.task_title, sourceRef: run1.source_ref, baseBranch: run1.base_branch, taskBranch: run1.task_branch, workspacePath: run1.workspace_path, createdAt: run1.created_at, updatedAt: run1.updated_at, lastError: run1.last_error })
      db.createRun({ ...run2, taskPath: run2.task_path, taskTitle: run2.task_title, sourceRef: run2.source_ref, baseBranch: run2.base_branch, taskBranch: run2.task_branch, workspacePath: run2.workspace_path, createdAt: run2.created_at, updatedAt: run2.updated_at, lastError: run2.last_error })

      const runs = db.listRuns(10)
      expect(runs).toHaveLength(2)
      expect(runs[0].id).toBe('run-2') // Most recent first
      expect(runs[1].id).toBe('run-1')
    })

    it('should update run status', () => {
      const run = createTestRun({ id: 'run-status-test', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' })
      db.createRun({ ...run, taskPath: run.task_path, taskTitle: run.task_title, sourceRef: run.source_ref, baseBranch: run.base_branch, taskBranch: run.task_branch, workspacePath: run.workspace_path, createdAt: run.created_at, updatedAt: run.updated_at, lastError: run.last_error })

      const updated = db.updateRunStatus('run-status-test', 'running')

      expect(updated).not.toBeNull()
      expect(updated?.status).toBe('running')
      expect(Date.parse(updated!.updated_at)).toBeGreaterThan(Date.parse(run.updated_at))
    })

    it('should list runs by status', () => {
      const run1 = createTestRun({ id: 'run-queued', status: 'queued' })
      const run2 = createTestRun({ id: 'run-running', status: 'running' })

      db.createRun({ ...run1, taskPath: run1.task_path, taskTitle: run1.task_title, sourceRef: run1.source_ref, baseBranch: run1.base_branch, taskBranch: run1.task_branch, workspacePath: run1.workspace_path, createdAt: run1.created_at, updatedAt: run1.updated_at, lastError: run1.last_error })
      db.createRun({ ...run2, taskPath: run2.task_path, taskTitle: run2.task_title, sourceRef: run2.source_ref, baseBranch: run2.base_branch, taskBranch: run2.task_branch, workspacePath: run2.workspace_path, createdAt: run2.created_at, updatedAt: run2.updated_at, lastError: run2.last_error })

      const queued = db.listRunsByStatus('queued')
      expect(queued).toHaveLength(1)
      expect(queued[0].id).toBe('run-queued')
    })
  })

  describe('repo Lock Operations', () => {
    it('should create and retrieve repo lock', () => {
      db.upsertRepoLock({
        repo: 'test-repo',
        runId: 'run-1',
        taskBranch: 'ai/run-1',
        status: 'running',
        lockedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const lock = db.getActiveRepoLock('test-repo')
      expect(lock).not.toBeNull()
      expect(lock?.repo).toBe('test-repo')
      expect(lock?.run_id).toBe('run-1')
    })

    it('should update existing lock', () => {
      const now = new Date().toISOString()

      db.upsertRepoLock({
        repo: 'test-repo',
        runId: 'run-1',
        taskBranch: 'ai/run-1',
        status: 'running',
        lockedAt: now,
        updatedAt: now,
      })

      db.upsertRepoLock({
        repo: 'test-repo',
        runId: 'run-2',
        taskBranch: 'ai/run-2',
        status: 'queued',
        lockedAt: now,
        updatedAt: now,
      })

      const lock = db.getActiveRepoLock('test-repo')
      expect(lock?.run_id).toBe('run-2')
      expect(lock?.status).toBe('queued')
    })

    it('should delete repo lock', () => {
      const now = new Date().toISOString()

      db.upsertRepoLock({
        repo: 'test-repo',
        runId: 'run-1',
        taskBranch: 'ai/run-1',
        status: 'running',
        lockedAt: now,
        updatedAt: now,
      })

      db.deleteRepoLock('test-repo')

      const lock = db.getActiveRepoLock('test-repo')
      expect(lock).toBeNull()
    })
  })

  describe('event Operations', () => {
    it('should append and list run events', () => {
      const event = db.appendRunEvent({
        runId: 'run-events-test',
        type: 'run.started',
        nodeId: null,
        role: null,
        message: 'Run started',
        payload: { model: 'gpt-4' },
        createdAt: new Date().toISOString(),
      })

      expect(event.id).toBeGreaterThan(0)
      expect(event.run_id).toBe('run-events-test')
      expect(event.type).toBe('run.started')

      const events = db.listRunEvents('run-events-test', 10)
      expect(events).toHaveLength(1)
      expect(events[0].message).toBe('Run started')
    })

    it('should parse JSON payload in events', () => {
      db.appendRunEvent({
        runId: 'run-payload-test',
        type: 'test.event',
        message: 'Test',
        payload: { key: 'value', nested: { a: 1 } },
      })

      const events = db.listRunEvents('run-payload-test', 10)
      expect(events[0].payload).toEqual({ key: 'value', nested: { a: 1 } })
    })

    it('should handle null payload', () => {
      db.appendRunEvent({
        runId: 'run-null-payload',
        type: 'test.event',
        message: 'Test',
        payload: null,
      })

      const events = db.listRunEvents('run-null-payload', 10)
      expect(events[0].payload).toBeNull()
    })
  })

  describe('reset Database', () => {
    it('should clear all data on reset', () => {
      const run = createTestRun({ id: 'reset-test' })
      db.createRun({ ...run, taskPath: run.task_path, taskTitle: run.task_title, sourceRef: run.source_ref, baseBranch: run.base_branch, taskBranch: run.task_branch, workspacePath: run.workspace_path, createdAt: run.created_at, updatedAt: run.updated_at, lastError: run.last_error })
      db.appendRunEvent({ runId: 'reset-test', type: 'test', message: 'Test' })
      db.upsertRepoLock({
        repo: 'reset-repo',
        runId: 'reset-test',
        taskBranch: 'ai/reset',
        status: 'running',
        lockedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      resetTestDb(db)

      expect(db.getRun('reset-test')).toBeNull()
      expect(db.getActiveRepoLock('reset-repo')).toBeNull()
      expect(db.listRunEvents('reset-test', 10)).toHaveLength(0)
    })
  })
})
