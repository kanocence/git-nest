import type { DbApi } from '../../src/db'
import type { RunManager } from '../../src/services/run-manager'
import type { Config } from '../../src/types'
import type { EventBus } from '../../src/utils/events'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { errorHandler } from '../../src/middleware/error'
import { setupRoutes } from '../../src/routes'
import { createEventBus } from '../../src/utils/events'
import { createTestConfig } from '../helpers/factory'
import { createTestDb } from '../helpers/test-db'

describe('aPI Routes Integration', () => {
  let app: Hono<any>
  let config: Config
  let db: DbApi
  let bus: EventBus
  let runManager: RunManager

  beforeAll(() => {
    app = new Hono<any>()
    config = createTestConfig({ allowInsecureNoAuth: true })
    db = createTestDb()
    bus = createEventBus()
    runManager = {
      startRun: async () => {},
      resumeRun: async () => {},
      retryRun: async () => {},
      cancelRun: () => true,
      resumeQueuedRuns: () => {},
    }

    app.onError(errorHandler)
    setupRoutes(app, config, db, bus, runManager)
  })

  afterAll(() => {
    db.db.close()
  })

  describe('gET /health', () => {
    it('should return health status', async () => {
      const res = await app.request('/health')
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.status).toBe('ok')
      expect(json.dbPath).toBeDefined()
    })
  })

  describe('gET /api/runs', () => {
    it('should return empty runs list initially', async () => {
      const res = await app.request('/api/runs')
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.runs).toEqual([])
      expect(json.total).toBe(0)
    })

    it('should return runs after creating one', async () => {
      // Create a run directly in DB
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-1',
        repo: 'test-repo',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-1',
        status: 'queued',
        workspacePath: '/tmp/test/workspace/test-repo',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      const res = await app.request('/api/runs')
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.runs).toHaveLength(1)
      expect(json.runs[0].id).toBe('test-run-1')
      expect(json.total).toBe(1)
    })
  })

  describe('gET /api/runs/:runId', () => {
    it('should return run details', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-detail',
        repo: 'test-repo',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-detail',
        status: 'running',
        workspacePath: '/tmp/test/workspace/test-repo',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      const res = await app.request('/api/runs/test-run-detail')
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.run.id).toBe('test-run-detail')
      expect(json.run.status).toBe('running')
      expect(json.events).toEqual([])
    })

    it('should return 404 for non-existent run', async () => {
      const res = await app.request('/api/runs/non-existent')
      expect(res.status).toBe(404)

      const json = await res.json()
      expect(json.error).toBe('Run not found')
      expect(json.code).toBe('RUN_NOT_FOUND')
    })
  })

  describe('pOST /api/runs/:runId/approve', () => {
    it('should approve a waiting approval run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-approve',
        repo: 'test-repo',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-approve',
        status: 'waiting_approval',
        workspacePath: '/tmp/test/workspace/test-repo',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      const res = await app.request('/api/runs/test-run-approve/approve', {
        method: 'POST',
      })
      expect(res.status).toBe(202)

      const json = await res.json()
      expect(json.note).toContain('approved')
    })

    it('should return 409 for non-waiting run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-not-waiting',
        repo: 'test-repo',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-not-waiting',
        status: 'running',
        workspacePath: '/tmp/test/workspace/test-repo',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      const res = await app.request('/api/runs/test-run-not-waiting/approve', {
        method: 'POST',
      })
      expect(res.status).toBe(409)
    })
  })

  describe('pOST /api/runs/:runId/reject', () => {
    it('should reject a waiting approval run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-reject',
        repo: 'test-repo',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-reject',
        status: 'waiting_approval',
        workspacePath: '/tmp/test/workspace/test-repo',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      const res = await app.request('/api/runs/test-run-reject/reject', {
        method: 'POST',
      })
      expect(res.status).toBe(202)

      const json = await res.json()
      expect(json.note).toContain('rejected')
    })
  })

  describe('pOST /api/runs/:runId/release', () => {
    it('should release a running run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-release',
        repo: 'test-repo',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-release',
        status: 'running',
        workspacePath: '/tmp/test/workspace/test-repo',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      // Lock the repo
      db.upsertRepoLock({
        repo: 'test-repo',
        runId: 'test-run-release',
        taskBranch: 'ai/test-run-release',
        status: 'running',
        lockedAt: now,
        updatedAt: now,
      })

      const res = await app.request('/api/runs/test-run-release/release', {
        method: 'POST',
      })
      // Either 202 (cancellation signal) or 200 (released)
      expect([200, 202]).toContain(res.status)
    })
  })
})
