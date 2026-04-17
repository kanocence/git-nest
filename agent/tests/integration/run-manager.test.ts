import type { CodingExecutor } from '../../src/services/executors/types'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureRunWorkspace, getRunWorkspacePath } from '../../src/services/git'
import { createRunManager } from '../../src/services/run-manager'
import { createEventBus } from '../../src/utils/events'
import { RUN_STATUS } from '../../src/utils/status'
import { createTestConfig } from '../helpers/factory'
import { createTestDb } from '../helpers/test-db'
import { cleanupTempDir, createTempDir, sleep, waitFor } from '../helpers/test-utils'

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
}

function createBareRepo(dataDir: string, repo: string, taskPath: string, taskContent: string): void {
  const sourceDir = path.join(dataDir, '..', 'source')
  mkdirSync(path.dirname(path.join(sourceDir, taskPath)), { recursive: true })
  writeFileSync(path.join(sourceDir, 'README.md'), '# Run Manager Test\n', 'utf8')
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

describe('run manager executor integration', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir)
      cleanupTempDir(tempDir)
    tempDir = null
  })

  it('should complete a run without approval and push changes', async () => {
    tempDir = createTempDir('git-nest-run-manager-complete-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-complete'
    const taskPath = '.git-nest/tasks/complete.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Complete',
      'description: Test executor should complete and commit.',
      'base_branch: main',
      'acceptance:',
      '  commands:',
      '    - node --version',
      '  timeout: 30000',
      '',
    ].join('\n'))

    const config = createTestConfig({
      dataDir,
      workspaceDir,
      stateDir,
      gitTimeoutMs: 30000,
      commandTimeoutMs: 30000,
    })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Complete',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })

      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run(input) {
          writeFileSync(path.join(input.workspacePath, 'complete.txt'), `Complete ${input.runId}`, 'utf8')
          return {
            status: 'completed',
            summary: 'Completed without approval',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.completed, 30000, 100)

      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(db.getApprovalState(runId)).toBeNull()
      expect(git(['--git-dir', path.join(dataDir, `${repo}.git`), 'show', `${taskBranch}:complete.txt`])).toContain(runId)

      const eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.started')
      expect(eventTypes).toContain('run.acceptance_completed')
      expect(eventTypes).toContain('run.completed')
    }
    finally {
      db.db.close()
    }
  }, 60000)

  it('should fail without committing when acceptance fails', async () => {
    tempDir = createTempDir('git-nest-run-manager-acceptance-failed-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-acceptance-failed'
    const taskPath = '.git-nest/tasks/acceptance-failed.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Acceptance Failed',
      'description: Test acceptance failure handling.',
      'base_branch: main',
      'acceptance:',
      '  commands:',
      '    - node --invalid-option-for-git-nest-test',
      '  timeout: 30000',
      '',
    ].join('\n'))

    const config = createTestConfig({
      dataDir,
      workspaceDir,
      stateDir,
      gitTimeoutMs: 30000,
      commandTimeoutMs: 30000,
    })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Acceptance Failed',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })

      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run(input) {
          writeFileSync(path.join(input.workspacePath, 'acceptance-failed.txt'), `Uncommitted ${input.runId}`, 'utf8')
          return {
            status: 'completed',
            summary: 'Executor completed before acceptance failure',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.failed, 30000, 100)

      expect(db.getRun(runId)?.last_error).toBe('Acceptance commands failed')
      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(existsSync(path.join(workspacePath, 'acceptance-failed.txt'))).toBe(true)
      expect(() => git(['--git-dir', path.join(dataDir, `${repo}.git`), 'show', `${taskBranch}:acceptance-failed.txt`])).toThrow()

      const eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.acceptance_completed')
      expect(eventTypes).toContain('run.failed')
    }
    finally {
      db.db.close()
    }
  }, 60000)

  it('should fail and release the lock when the executor fails', async () => {
    tempDir = createTempDir('git-nest-run-manager-executor-failed-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-executor-failed'
    const taskPath = '.git-nest/tasks/executor-failed.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Executor Failed',
      'description: Test executor failure handling.',
      'base_branch: main',
      '',
    ].join('\n'))

    const config = createTestConfig({ dataDir, workspaceDir, stateDir, gitTimeoutMs: 30000 })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Executor Failed',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })
      db.upsertRepoLock({
        repo,
        runId,
        taskBranch,
        status: RUN_STATUS.queued,
        lockedAt: now,
        updatedAt: now,
      })

      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run() {
          return {
            status: 'failed',
            summary: 'Executor crashed',
            exitCode: 1,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.failed, 30000, 100)

      expect(db.getRun(runId)?.last_error).toBe('Executor crashed')
      expect(db.getActiveRepoLock(repo)).toBeNull()
      const eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.failed')
    }
    finally {
      db.db.close()
    }
  }, 60000)

  it('should cancel an active run through cancelRun', async () => {
    tempDir = createTempDir('git-nest-run-manager-cancel-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-cancel'
    const taskPath = '.git-nest/tasks/cancel.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Cancel',
      'description: Test cancellation handling.',
      'base_branch: main',
      '',
    ].join('\n'))

    const config = createTestConfig({ dataDir, workspaceDir, stateDir, gitTimeoutMs: 30000 })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Cancel',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })

      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run(_input, signal) {
          while (!signal.aborted)
            await sleep(10)

          return {
            status: 'cancelled',
            summary: 'Cancelled by test',
            exitCode: 130,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.running, 10000, 100)

      expect(manager.cancelRun(runId)).toBe(true)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.cancelled, 30000, 100)

      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(db.listRunEvents(runId, 100).map(event => event.type)).toContain('run.cancelled')
    }
    finally {
      db.db.close()
    }
  }, 60000)

  it('should retry a system interrupted run', async () => {
    tempDir = createTempDir('git-nest-run-manager-retry-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-retry'
    const taskPath = '.git-nest/tasks/retry.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Retry',
      'description: Test retry handling.',
      'base_branch: main',
      '',
    ].join('\n'))

    const config = createTestConfig({ dataDir, workspaceDir, stateDir, gitTimeoutMs: 30000 })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Retry',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.systemInterrupted,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: 'Previous process exited',
      })
      db.createRun({
        id: 'run-not-retryable',
        repo,
        taskPath,
        taskTitle: 'Not Retryable',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/run-not-retryable',
        status: RUN_STATUS.queued,
        workspacePath: path.join(workspaceDir, 'run-not-retryable'),
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })
      db.upsertRepoLock({
        repo,
        runId,
        taskBranch,
        status: RUN_STATUS.systemInterrupted,
        lockedAt: now,
        updatedAt: now,
      })

      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run(input) {
          writeFileSync(path.join(input.workspacePath, 'retry.txt'), `Retried ${input.runId}`, 'utf8')
          return {
            status: 'completed',
            summary: 'Retry completed',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await expect(manager.retryRun('not-found')).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' })
      await expect(manager.retryRun('run-not-retryable')).rejects.toMatchObject({ code: 'RUN_NOT_RETRYABLE' })
      await manager.retryRun(runId)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.completed, 30000, 100)

      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(git(['--git-dir', path.join(dataDir, `${repo}.git`), 'show', `${taskBranch}:retry.txt`])).toContain(runId)
      const eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.retry')
      expect(eventTypes).toContain('run.completed')
    }
    finally {
      db.db.close()
    }
  }, 60000)

  it('should pause for approval before acceptance and commit', async () => {
    tempDir = createTempDir('git-nest-run-manager-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-approval'
    const taskPath = '.git-nest/tasks/approval.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Approval',
      'description: Test executor should write a file.',
      'base_branch: main',
      'require_approval: true',
      'acceptance:',
      '  commands:',
      '    - node --version',
      '  timeout: 30000',
      '',
    ].join('\n'))

    const config = createTestConfig({
      dataDir,
      workspaceDir,
      stateDir,
      gitTimeoutMs: 30000,
      commandTimeoutMs: 30000,
    })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Approval',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })

      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run(input) {
          yield {
            type: 'action',
            message: 'Writing test change',
            payload: { action: 'write_file', path: 'executor-change.txt' },
            timestamp: Date.now(),
          }
          writeFileSync(path.join(input.workspacePath, 'executor-change.txt'), `Change by ${input.runId}`, 'utf8')
          return {
            status: 'completed',
            summary: 'Test executor completed successfully',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)

      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.waitingApproval, 10000, 100)

      expect(existsSync(path.join(workspacePath, 'executor-change.txt'))).toBe(true)
      expect(git(['--git-dir', path.join(dataDir, `${repo}.git`), 'rev-parse', '--verify', taskBranch])).toBeTruthy()
      expect(() => git(['--git-dir', path.join(dataDir, `${repo}.git`), 'show', `${taskBranch}:executor-change.txt`])).toThrow()

      let eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.executor_action')
      expect(eventTypes).toContain('run.waiting_approval')
      expect(eventTypes).not.toContain('run.acceptance_completed')

      const approvalState = db.getApprovalState(runId)
      expect(approvalState).not.toBeNull()
      const approvalPayload = JSON.parse(approvalState!.prior_outputs) as {
        executorResult: { status: string }
        commitInfo?: unknown
        acceptanceResults?: unknown
      }
      expect(approvalPayload.executorResult.status).toBe('completed')
      expect(approvalPayload.commitInfo).toBeUndefined()
      expect(approvalPayload.acceptanceResults).toBeUndefined()

      await manager.resumeRun(runId, 'approved')

      expect(db.getRun(runId)?.status).toBe(RUN_STATUS.completed)
      expect(db.getApprovalState(runId)).toBeNull()
      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(git(['--git-dir', path.join(dataDir, `${repo}.git`), 'show', `${taskBranch}:executor-change.txt`])).toContain(runId)

      eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.acceptance_completed')
      expect(eventTypes.indexOf('run.waiting_approval')).toBeLessThan(eventTypes.indexOf('run.acceptance_completed'))
    }
    finally {
      db.db.close()
    }
  })

  it('should pause for continuation when executor budget is exhausted', async () => {
    tempDir = createTempDir('git-nest-run-manager-continuation-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-continuation'
    const taskPath = '.git-nest/tasks/continuation.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Continuation',
      'description: Continue after executor timeout.',
      'base_branch: main',
      'executor:',
      '  max_turns: 1',
      '  timeout: 1000',
      '  max_continuations: 1',
      '',
    ].join('\n'))

    const config = createTestConfig({
      dataDir,
      workspaceDir,
      stateDir,
      gitTimeoutMs: 30000,
      commandTimeoutMs: 30000,
    })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Continuation',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })

      let calls = 0
      let finishContinuation!: () => void
      const continuationCanFinish = new Promise<void>((resolve) => {
        finishContinuation = resolve
      })
      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run(input) {
          calls += 1
          if (calls === 1) {
            return {
              status: 'failed',
              summary: 'Goose executor timed out',
              exitCode: 124,
              hasToolErrors: false,
            }
          }

          writeFileSync(path.join(input.workspacePath, 'continued.txt'), input.prompt, 'utf8')
          await continuationCanFinish
          return {
            status: 'completed',
            summary: 'Continuation completed',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)

      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.waitingContinuation, 10000, 100)
      expect(db.getApprovalState(runId)).not.toBeNull()
      expect(db.getActiveRepoLock(repo)?.status).toBe(RUN_STATUS.waitingContinuation)

      await manager.continueRun(runId, 'continue')
      expect(db.getRun(runId)?.status).toBe(RUN_STATUS.running)
      expect(db.getActiveRepoLock(repo)?.status).toBe(RUN_STATUS.running)
      finishContinuation()
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.completed, 30000, 100)

      expect(calls).toBe(2)
      expect(db.getApprovalState(runId)).toBeNull()
      expect(db.getActiveRepoLock(repo)).toBeNull()

      const prompt = git(['--git-dir', path.join(dataDir, `${repo}.git`), 'show', `${taskBranch}:continued.txt`])
      expect(prompt).toContain('You are continuing a previous attempt')

      const eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes).toContain('run.waiting_continuation')
      expect(eventTypes).toContain('run.continuation_started')
      expect(eventTypes).toContain('run.completed')
    }
    finally {
      db.db.close()
    }
  })

  it('should reject continuation when continuation state is missing', async () => {
    const db = createTestDb()
    const config = createTestConfig()
    const now = new Date().toISOString()

    try {
      db.createRun({
        id: 'run-missing-continuation-state',
        repo: 'repo-missing-continuation-state',
        taskPath: '.git-nest/tasks/missing.yaml',
        taskTitle: 'Missing Continuation State',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: 'ai/run-missing-continuation-state',
        status: RUN_STATUS.waitingContinuation,
        workspacePath: '/tmp/git-nest/run-missing-continuation-state',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })

      const manager = createRunManager(config, db, createEventBus(), {
        name: 'test-executor',
        async* run() {
          return {
            status: 'completed',
            summary: 'unused',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      })

      await expect(manager.continueRun('run-missing-continuation-state', 'continue')).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONTINUATION_STATE_MISSING',
      })
      expect(db.getRun('run-missing-continuation-state')?.status).toBe(RUN_STATUS.waitingContinuation)
    }
    finally {
      db.db.close()
    }
  })

  it('should reject continuation when continuation state is invalid', async () => {
    const db = createTestDb()
    const config = createTestConfig()
    const runId = 'run-invalid-continuation-state'
    const now = new Date().toISOString()

    try {
      db.createRun({
        id: runId,
        repo: 'repo-invalid-continuation-state',
        taskPath: '.git-nest/tasks/invalid.yaml',
        taskTitle: 'Invalid Continuation State',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: `ai/${runId}`,
        status: RUN_STATUS.waitingContinuation,
        workspacePath: '/tmp/git-nest/run-invalid-continuation-state',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createApprovalState({
        runId,
        nodeId: 'continuation',
        role: 'continuation_approval',
        question: 'Continue?',
        priorOutputs: { continuationsUsed: 0 },
      })
      db.db.prepare('UPDATE approval_states SET prior_outputs = ? WHERE run_id = ?').run('not-json', runId)

      const manager = createRunManager(config, db, createEventBus(), {
        name: 'test-executor',
        async* run() {
          return {
            status: 'completed',
            summary: 'unused',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      })

      await expect(manager.continueRun(runId, 'continue')).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONTINUATION_STATE_INVALID',
      })
      expect(db.getApprovalState(runId)).not.toBeNull()
      expect(db.getRun(runId)?.status).toBe(RUN_STATUS.waitingContinuation)
    }
    finally {
      db.db.close()
    }
  })

  it('should fail when continuation budget is exhausted', async () => {
    tempDir = createTempDir('git-nest-run-manager-continuation-exhausted-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })

    const repo = 'repo'
    const runId = 'run-integration-continuation-exhausted'
    const taskPath = '.git-nest/tasks/continuation-exhausted.yaml'
    const taskBranch = `ai/${runId}`
    createBareRepo(dataDir, repo, taskPath, [
      'title: Integration Continuation Exhausted',
      'description: Keep timing out after continuation.',
      'base_branch: main',
      'executor:',
      '  max_turns: 1',
      '  timeout: 1000',
      '  max_continuations: 1',
      '',
    ].join('\n'))

    const config = createTestConfig({
      dataDir,
      workspaceDir,
      stateDir,
      gitTimeoutMs: 30000,
      commandTimeoutMs: 30000,
    })
    const db = createTestDb()
    const workspacePath = getRunWorkspacePath(config, repo, runId)
    const now = new Date().toISOString()

    try {
      ensureRunWorkspace(config, repo, runId, 'main', taskBranch)
      db.createRun({
        id: runId,
        repo,
        taskPath,
        taskTitle: 'Integration Continuation Exhausted',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch,
        status: RUN_STATUS.queued,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.createRunWorkspace({ runId, repo, workspacePath })

      let calls = 0
      const testExecutor: CodingExecutor = {
        name: 'test-executor',
        async* run() {
          calls += 1
          return {
            status: 'failed',
            summary: 'Goose executor timed out',
            exitCode: 124,
            hasToolErrors: false,
          }
        },
      }

      const manager = createRunManager(config, db, createEventBus(), testExecutor)
      await manager.startRun(runId)
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.waitingContinuation, 10000, 100)

      await manager.continueRun(runId, 'continue')
      await waitFor(() => db.getRun(runId)?.status === RUN_STATUS.failed, 30000, 100)

      expect(calls).toBe(2)
      expect(db.getApprovalState(runId)).toBeNull()
      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(db.getRun(runId)?.last_error).toBe('Goose executor timed out')

      const eventTypes = db.listRunEvents(runId, 100).map(event => event.type)
      expect(eventTypes.filter(type => type === 'run.waiting_continuation')).toHaveLength(1)
      expect(eventTypes).toContain('run.failed')
    }
    finally {
      db.db.close()
    }
  }, 60000)

  it('should stop and release a waiting continuation run when continuation state is missing', async () => {
    const db = createTestDb()
    const config = createTestConfig()
    const runId = 'run-stop-missing-continuation-state'
    const repo = 'repo-stop-missing-continuation-state'
    const now = new Date().toISOString()

    try {
      db.createRun({
        id: runId,
        repo,
        taskPath: '.git-nest/tasks/missing.yaml',
        taskTitle: 'Missing Continuation State',
        sourceRef: 'main',
        baseBranch: 'main',
        taskBranch: `ai/${runId}`,
        status: RUN_STATUS.waitingContinuation,
        workspacePath: '/tmp/git-nest/run-stop-missing-continuation-state',
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      db.upsertRepoLock({
        repo,
        runId,
        taskBranch: `ai/${runId}`,
        status: RUN_STATUS.waitingContinuation,
        lockedAt: now,
        updatedAt: now,
      })

      const manager = createRunManager(config, db, createEventBus(), {
        name: 'test-executor',
        async* run() {
          return {
            status: 'completed',
            summary: 'unused',
            exitCode: 0,
            hasToolErrors: false,
          }
        },
      })

      await manager.continueRun(runId, 'stop')

      expect(db.getRun(runId)?.status).toBe(RUN_STATUS.cancelled)
      expect(db.getActiveRepoLock(repo)).toBeNull()
      expect(db.getApprovalState(runId)).toBeNull()
      expect(db.listRunEvents(runId, 100).map(event => event.type)).toContain('run.continuation_stopped')
    }
    finally {
      db.db.close()
    }
  })
})
