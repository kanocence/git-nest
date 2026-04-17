import type { DbApi } from '../../src/db'
import type { RunManager } from '../../src/services/run-manager'
import type { Config } from '../../src/types'
import type { EventBus } from '../../src/utils/events'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../../src/middleware/error'
import { setupRoutes } from '../../src/routes'
import { createEventBus } from '../../src/utils/events'
import { createTestConfig } from '../helpers/factory'
import { createTestDb } from '../helpers/test-db'
import { cleanupTempDir, createTempDir } from '../helpers/test-utils'

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
}

function createBareRepo(dataDir: string, repo: string, taskPath: string, taskContent: string): void {
  const sourceDir = path.join(dataDir, '..', `source-${repo}`)
  mkdirSync(path.dirname(path.join(sourceDir, taskPath)), { recursive: true })
  writeFileSync(path.join(sourceDir, 'README.md'), '# Routes Test\n', 'utf8')
  writeFileSync(path.join(sourceDir, taskPath), taskContent, 'utf8')

  git(['init'], sourceDir)
  git(['config', 'user.email', 'test@example.com'], sourceDir)
  git(['config', 'user.name', 'Test User'], sourceDir)
  git(['config', 'core.autocrlf', 'false'], sourceDir)
  git(['add', '.'], sourceDir)
  git(['commit', '-m', 'init'], sourceDir)
  git(['branch', '-M', 'main'], sourceDir)
  git(['clone', '--bare', sourceDir, path.join(dataDir, `${repo}.git`)])
}

function createRouteApp(config: Config, db: DbApi, bus: EventBus, manager: RunManager): Hono<any> {
  const app = new Hono<any>()
  app.onError(errorHandler)
  setupRoutes(app, config, db, bus, manager)
  return app
}

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
      startRun: vi.fn(async () => {}),
      resumeRun: vi.fn(async () => {}),
      continueRun: vi.fn(async () => {}),
      retryRun: vi.fn(async () => {}),
      cancelRun: vi.fn(() => true),
      resumeQueuedRuns: vi.fn(() => {}),
    }

    app.onError(errorHandler)
    setupRoutes(app, config, db, bus, runManager)
  })

  beforeEach(() => {
    vi.clearAllMocks()
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

  describe('pOST /api/repos/:repo/tasks/start', () => {
    it('should create a run, prepare workspace, publish event, and schedule execution', async () => {
      const tempDir = createTempDir('git-nest-routes-start-')
      const dataDir = path.join(tempDir, 'git')
      const workspaceDir = path.join(tempDir, 'workspace')
      const stateDir = path.join(tempDir, 'state')
      const taskPath = '.git-nest/tasks/start.yaml'
      const repo = 'start-repo'

      mkdirSync(dataDir, { recursive: true })
      mkdirSync(workspaceDir, { recursive: true })
      mkdirSync(stateDir, { recursive: true })
      createBareRepo(dataDir, repo, taskPath, [
        'title: Start Route Task',
        'description: Verify start route behavior.',
        'base_branch: main',
        '',
      ].join('\n'))

      const localDb = createTestDb()
      const localBus = createEventBus()
      const published: unknown[] = []
      localBus.subscribe(event => published.push(event))

      const startRun = vi.fn(async () => {})
      const localManager: RunManager = {
        startRun,
        resumeRun: vi.fn(async () => {}),
        continueRun: vi.fn(async () => {}),
        retryRun: vi.fn(async () => {}),
        cancelRun: vi.fn(() => true),
        resumeQueuedRuns: vi.fn(() => {}),
      }
      const localApp = createRouteApp(
        createTestConfig({ allowInsecureNoAuth: true, dataDir, workspaceDir, stateDir }),
        localDb,
        localBus,
        localManager,
      )

      try {
        const res = await localApp.request(`/api/repos/${repo}/tasks/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskPath }),
        })

        expect(res.status).toBe(202)
        const json = await res.json()
        const run = localDb.getRun(json.run.id)
        expect(run).not.toBeNull()
        expect(run?.repo).toBe(repo)
        expect(run?.task_path).toBe(taskPath)
        expect(run?.status).toBe('queued')
        expect(localDb.getActiveRepoLock(repo)?.run_id).toBe(run?.id)
        expect(localDb.getActiveRepoLock(repo)?.status).toBe('queued')
        expect(localDb.db.prepare('SELECT workspace_path FROM run_workspaces WHERE run_id = ?').get(run!.id)).toBeTruthy()
        expect(startRun).toHaveBeenCalledTimes(1)
        expect(startRun).toHaveBeenCalledWith(run!.id)
        expect(published).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: 'run.queued',
            runId: run!.id,
            repo,
            taskPath,
            status: 'queued',
          }),
        ]))
      }
      finally {
        localDb.db.close()
        cleanupTempDir(tempDir)
      }
    }, 60000)

    it('should reject start when the repo is already locked', async () => {
      const tempDir = createTempDir('git-nest-routes-start-busy-')
      const dataDir = path.join(tempDir, 'git')
      const workspaceDir = path.join(tempDir, 'workspace')
      const stateDir = path.join(tempDir, 'state')
      const taskPath = '.git-nest/tasks/start.yaml'
      const repo = 'busy-repo'

      mkdirSync(dataDir, { recursive: true })
      mkdirSync(workspaceDir, { recursive: true })
      mkdirSync(stateDir, { recursive: true })
      createBareRepo(dataDir, repo, taskPath, [
        'title: Busy Route Task',
        'description: Verify busy route behavior.',
        'base_branch: main',
        '',
      ].join('\n'))

      const localDb = createTestDb()
      const startRun = vi.fn(async () => {})
      const localManager: RunManager = {
        startRun,
        resumeRun: vi.fn(async () => {}),
        continueRun: vi.fn(async () => {}),
        retryRun: vi.fn(async () => {}),
        cancelRun: vi.fn(() => true),
        resumeQueuedRuns: vi.fn(() => {}),
      }
      const localApp = createRouteApp(
        createTestConfig({ allowInsecureNoAuth: true, dataDir, workspaceDir, stateDir }),
        localDb,
        createEventBus(),
        localManager,
      )

      try {
        localDb.upsertRepoLock({
          repo,
          runId: 'active-run',
          taskBranch: 'ai/active-run',
          status: 'running',
          lockedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })

        const res = await localApp.request(`/api/repos/${repo}/tasks/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskPath }),
        })

        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('REPO_BUSY')
        expect(startRun).not.toHaveBeenCalled()
        expect(localDb.listRuns(10)).toHaveLength(0)
        expect(localDb.getActiveRepoLock(repo)?.run_id).toBe('active-run')
      }
      finally {
        localDb.db.close()
        cleanupTempDir(tempDir)
      }
    }, 60000)
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
      expect(runManager.resumeRun).toHaveBeenCalledWith('test-run-approve', 'approved')
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
      expect(runManager.resumeRun).not.toHaveBeenCalled()
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
      expect(runManager.resumeRun).toHaveBeenCalledWith('test-run-reject', 'rejected')
    })
  })

  describe('pOST /api/runs/:runId/continue', () => {
    it('should continue a waiting continuation run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-continue',
        repo: 'test-repo-continue',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-continue',
        status: 'waiting_continuation',
        workspacePath: '/tmp/test/workspace/test-repo-continue',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.upsertRepoLock({
        repo: 'test-repo-continue',
        runId: 'test-run-continue',
        taskBranch: 'ai/test-run-continue',
        status: 'waiting_continuation',
        lockedAt: now,
        updatedAt: now,
      })

      const res = await app.request('/api/runs/test-run-continue/continue', {
        method: 'POST',
      })

      expect(res.status).toBe(202)
      expect(runManager.continueRun).toHaveBeenCalledWith('test-run-continue', 'continue')
    })
  })

  describe('pOST /api/runs/:runId/stop', () => {
    it('should stop a waiting continuation run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-stop',
        repo: 'test-repo-stop',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-stop',
        status: 'waiting_continuation',
        workspacePath: '/tmp/test/workspace/test-repo-stop',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.upsertRepoLock({
        repo: 'test-repo-stop',
        runId: 'test-run-stop',
        taskBranch: 'ai/test-run-stop',
        status: 'waiting_continuation',
        lockedAt: now,
        updatedAt: now,
      })

      const res = await app.request('/api/runs/test-run-stop/stop', {
        method: 'POST',
      })

      expect(res.status).toBe(202)
      expect(runManager.continueRun).toHaveBeenCalledWith('test-run-stop', 'stop')
    })

    it('should reject stop when another run owns the repo lock', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-stop-busy',
        repo: 'test-repo-stop-busy',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-stop-busy',
        status: 'waiting_continuation',
        workspacePath: '/tmp/test/workspace/test-repo-stop-busy',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.upsertRepoLock({
        repo: 'test-repo-stop-busy',
        runId: 'other-active-run',
        taskBranch: 'ai/other-active-run',
        status: 'running',
        lockedAt: now,
        updatedAt: now,
      })

      const res = await app.request('/api/runs/test-run-stop-busy/stop', {
        method: 'POST',
      })

      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.code).toBe('REPO_BUSY')
      expect(db.getRun('test-run-stop-busy')?.status).toBe('waiting_continuation')
      expect(db.getActiveRepoLock('test-repo-stop-busy')?.run_id).toBe('other-active-run')
      expect(runManager.continueRun).not.toHaveBeenCalled()
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
      expect(res.status).toBe(202)
      expect(runManager.cancelRun).toHaveBeenCalledWith('test-run-release')
    })

    it('should clear approval state when releasing a waiting continuation run', async () => {
      const now = new Date().toISOString()
      db.createRun({
        id: 'test-run-release-continuation',
        repo: 'test-repo-continuation',
        taskPath: '.git-nest/tasks/test.yaml',
        taskTitle: 'Test Task',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/test-run-release-continuation',
        status: 'waiting_continuation',
        workspacePath: '/tmp/test/workspace/test-repo-continuation',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.upsertRepoLock({
        repo: 'test-repo-continuation',
        runId: 'test-run-release-continuation',
        taskBranch: 'ai/test-run-release-continuation',
        status: 'waiting_continuation',
        lockedAt: now,
        updatedAt: now,
      })
      db.createApprovalState({
        runId: 'test-run-release-continuation',
        nodeId: 'continuation',
        role: 'continuation_approval',
        question: 'Continue?',
        priorOutputs: { continuationsUsed: 0 },
      })

      const res = await app.request('/api/runs/test-run-release-continuation/release', {
        method: 'POST',
      })

      expect(res.status).toBe(200)
      expect(db.getRun('test-run-release-continuation')?.status).toBe('cancelled')
      expect(db.getActiveRepoLock('test-repo-continuation')).toBeNull()
      expect(db.getApprovalState('test-run-release-continuation')).toBeNull()
    })
  })
})
