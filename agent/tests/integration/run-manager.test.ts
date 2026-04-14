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
import { cleanupTempDir, createTempDir, waitFor } from '../helpers/test-utils'

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
})
