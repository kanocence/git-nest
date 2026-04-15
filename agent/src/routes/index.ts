import type { Hono } from 'hono'
import type { DbApi } from '../db'
import type { RunManager } from '../services/run-manager'
import type { Config } from '../types'
import type { EventBus } from '../utils/events'
import {
  cleanupRunWorkspace,
  createRunId,
  deleteTaskFile,
  ensureRunWorkspace,
  getDefaultRef,
  getRunWorkspacePath,
  getWorkspaceInfo,
  listTaskFiles,
  readTaskFile,
  validateRepoName,
  writeTaskFile,
} from '../services/git'
import { parseTaskDefinitionV2, toTaskSummaryV2 } from '../services/tasks'
import { AppError } from '../utils/errors'
import { withRepoMutex } from '../utils/locks'
import { isLockedRunStatus, RUN_STATUS } from '../utils/status'

interface AppContext {
  Variables: {
    config: Config
    store: DbApi
    bus: EventBus
    runManager: RunManager
  }
}

export function setupRoutes(
  app: Hono<AppContext>,
  config: Config,
  store: DbApi,
  bus: EventBus,
  runManager: RunManager,
) {
  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', dbPath: config.dbPath })
  })

  // SSE event stream
  app.get('/api/events', (c) => {
    return new Promise<Response>((resolve) => {
      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

          // 订阅事件
          const unsubscribe = bus.subscribe((event) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            }
            catch {
              // Client disconnected, unsubscribe
              unsubscribe()
            }
          })

          // 清理
          c.req.raw.signal.addEventListener('abort', () => {
            unsubscribe()
          })
        },
      })

      resolve(new Response(stream, { headers }))
    })
  })

  // 列出任务
  app.get('/api/repos/:repo/tasks', async (c) => {
    const repo = validateRepoName(c.req.param('repo'))
    const ref = c.req.query('ref') || getDefaultRef(config, repo)
    const tasks = listTaskFiles(config, repo, ref).map((filePath) => {
      const content = readTaskFile(config, repo, ref, filePath)
      return toTaskSummaryV2(parseTaskDefinitionV2(content, filePath))
    })

    return c.json({ repo, ref, tasks, total: tasks.length })
  })

  // 上传任务文件
  app.post('/api/repos/:repo/tasks/upload', async (c) => {
    const repo = validateRepoName(c.req.param('repo'))
    const body = await c.req.json() as { filePath?: string, content?: string, ref?: string }
    const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : ''
    const content = typeof body.content === 'string' ? body.content : ''
    const ref = typeof body.ref === 'string' && body.ref.trim()
      ? body.ref.trim()
      : getDefaultRef(config, repo)

    if (!filePath) {
      throw new AppError(400, 'TASK_PATH_REQUIRED', 'filePath is required')
    }

    writeTaskFile(config, repo, ref, filePath, content)
    return c.json({ repo, ref, filePath, message: 'Task file uploaded' })
  })

  // 删除任务文件
  app.delete('/api/repos/:repo/tasks/delete', async (c) => {
    const repo = validateRepoName(c.req.param('repo'))
    const query = c.req.query('filePath')
    const filePath = typeof query === 'string' ? query.trim() : ''
    const refQuery = c.req.query('ref')
    const ref = typeof refQuery === 'string' && refQuery.trim()
      ? refQuery.trim()
      : getDefaultRef(config, repo)

    if (!filePath) {
      throw new AppError(400, 'TASK_PATH_REQUIRED', 'filePath is required')
    }

    deleteTaskFile(config, repo, ref, filePath)
    return c.json({ repo, ref, filePath, message: 'Task file deleted' })
  })

  // Workspace state
  app.get('/api/repos/:repo/workspace-state', async (c) => {
    const repo = validateRepoName(c.req.param('repo'))
    const lock = store.getActiveRepoLock(repo)
    const workspace = getWorkspaceInfo(config, repo, lock)

    return c.json({
      ...workspace,
      lockStatus: lock?.status || null,
      lockUpdatedAt: lock?.updated_at || null,
    })
  })

  // Start task
  app.post('/api/repos/:repo/tasks/start', async (c) => {
    const repo = validateRepoName(c.req.param('repo'))
    const body = await c.req.json() as { taskPath?: string, ref?: string }
    const requestedTaskPath = typeof body.taskPath === 'string' ? body.taskPath.trim() : ''

    if (!requestedTaskPath) {
      throw new AppError(400, 'TASK_PATH_REQUIRED', 'taskPath is required')
    }

    const sourceRef = typeof body.ref === 'string' && body.ref.trim()
      ? body.ref.trim()
      : getDefaultRef(config, repo)

    const tasks = listTaskFiles(config, repo, sourceRef)
    const taskPath = tasks.find(item => item === requestedTaskPath)
    if (!taskPath) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Task YAML not found in repository', {
        repo,
        taskPath: requestedTaskPath,
        ref: sourceRef,
      })
    }

    const content = readTaskFile(config, repo, sourceRef, taskPath)
    const task = parseTaskDefinitionV2(content, taskPath)

    // Validate task before creating run
    if (!task.valid) {
      throw new AppError(422, 'INVALID_TASK_YAML', 'Task YAML failed validation', {
        path: taskPath,
        errors: task.validationErrors,
        parseError: task.parseError,
      })
    }

    const runId = createRunId()
    const taskBranch = `ai/${runId}`
    const baseBranch = task.baseBranch || getDefaultRef(config, repo)

    const run = await withRepoMutex(repo, async () => {
      const activeLock = store.getActiveRepoLock(repo)
      if (activeLock) {
        throw new AppError(409, 'REPO_BUSY', 'Repository workspace is already occupied by an AI task', {
          runId: activeLock.run_id,
          branch: activeLock.task_branch,
        })
      }

      const now = new Date().toISOString()
      const workspacePath = getRunWorkspacePath(config, repo, runId)
      store.createRun({
        id: runId,
        repo,
        taskPath: task.path,
        taskTitle: task.title,
        sourceRef,
        baseBranch,
        taskBranch,
        status: RUN_STATUS.preparing,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      })
      store.createRunWorkspace({ runId, repo, workspacePath })

      store.upsertRepoLock({
        repo,
        runId,
        taskBranch,
        status: RUN_STATUS.preparing,
        lockedAt: now,
        updatedAt: now,
      })

      try {
        ensureRunWorkspace(config, repo, runId, baseBranch, taskBranch)
        store.updateRunStatus(runId, RUN_STATUS.queued)
        store.upsertRepoLock({
          repo,
          runId,
          taskBranch,
          status: RUN_STATUS.queued,
          lockedAt: now,
          updatedAt: new Date().toISOString(),
        })

        return store.getRun(runId)
      }
      catch (error) {
        store.updateRunStatus(runId, RUN_STATUS.failed, error instanceof Error ? error.message : 'Unknown error')
        store.deleteRepoLock(repo)
        throw error
      }
    })

    if (!run) {
      throw new AppError(500, 'RUN_CREATION_FAILED', 'Failed to create run')
    }

    bus.publish({
      type: 'run.queued',
      runId: run.id,
      repo: run.repo,
      taskPath: run.task_path,
      taskBranch: run.task_branch,
      status: run.status,
      workspacePath: run.workspace_path,
    })
    // Start run in background with error handling
    runManager.startRun(run.id).catch((error) => {
      // Error is already logged and run status is updated in startRun
      // This catch prevents unhandled promise rejection
      console.error('[routes] startRun failed:', error)
    })

    return c.json({
      run,
      workspace: getWorkspaceInfo(config, repo, store.getActiveRepoLock(repo)),
      note: 'The shared workspace and task branch are prepared. Background execution starts automatically.',
    }, 202)
  })

  // 列出运行
  app.get('/api/runs', (c) => {
    const runs = store.listRuns(100)
    return c.json({ runs, total: runs.length })
  })

  // 获取运行详情
  app.get('/api/runs/:runId', (c) => {
    const runId = c.req.param('runId')
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    return c.json({
      run,
      events: store.listRunEvents(run.id, 200),
      workspace: getWorkspaceInfo(config, run.repo, store.getActiveRepoLock(run.repo)),
    })
  })

  // 恢复运行
  app.post('/api/runs/:runId/resume', async (c) => {
    const runId = c.req.param('runId')
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.waitingApproval) {
      throw new AppError(409, 'RUN_NOT_WAITING_APPROVAL', 'Run is not waiting for approval', {
        runId: run.id,
        status: run.status,
      })
    }

    const body = await c.req.json() as { resume?: string | boolean, decision?: string | boolean }
    const rawResumeValue = body.resume ?? body.decision
    if (rawResumeValue === undefined) {
      throw new AppError(400, 'RESUME_VALUE_REQUIRED', 'resume or decision is required')
    }
    const resumeValue = normalizeResumeValue(rawResumeValue)

    await runManager.resumeRun(run.id, resumeValue as 'approved' | 'rejected')

    return c.json({
      run: store.getRun(run.id),
      note: 'Run resume has been scheduled.',
    }, 202)
  })

  // 批准运行
  app.post('/api/runs/:runId/approve', async (c) => {
    const runId = c.req.param('runId')
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.waitingApproval) {
      throw new AppError(409, 'RUN_NOT_WAITING_APPROVAL', 'Run is not waiting for approval', {
        runId: run.id,
        status: run.status,
      })
    }

    await runManager.resumeRun(run.id, 'approved')

    return c.json({
      run: store.getRun(run.id),
      note: 'Run has been approved and will continue execution.',
    }, 202)
  })

  // 拒绝运行
  app.post('/api/runs/:runId/reject', async (c) => {
    const runId = c.req.param('runId')
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.waitingApproval) {
      throw new AppError(409, 'RUN_NOT_WAITING_APPROVAL', 'Run is not waiting for approval', {
        runId: run.id,
        status: run.status,
      })
    }

    await runManager.resumeRun(run.id, 'rejected')

    return c.json({
      run: store.getRun(run.id),
      note: 'Run has been rejected and will be terminated.',
    }, 202)
  })

  // 重试运行
  app.post('/api/runs/:runId/retry', async (c) => {
    const runId = c.req.param('runId')
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.systemInterrupted) {
      throw new AppError(409, 'RUN_NOT_RETRYABLE', 'Only system_interrupted runs can be retried', {
        runId: run.id,
        status: run.status,
      })
    }

    await withRepoMutex(run.repo, async () => {
      const existingLock = store.getActiveRepoLock(run.repo)
      if (existingLock && existingLock.run_id !== run.id) {
        throw new AppError(409, 'REPO_BUSY', 'Repository is occupied by another active run', {
          runId: run.id,
          repo: run.repo,
          activeRunId: existingLock.run_id,
        })
      }

      await runManager.retryRun(run.id)
    })

    return c.json({
      run: store.getRun(run.id),
      note: 'Run has been scheduled for retry.',
    }, 202)
  })

  // 释放运行
  app.post('/api/runs/:runId/release', async (c) => {
    const runId = c.req.param('runId')
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (!isLockedRunStatus(run.status)) {
      throw new AppError(409, 'RUN_NOT_RELEASABLE', 'Only active runs can be released', {
        runId: run.id,
        status: run.status,
      })
    }

    // 对于 running 状态的任务，触发协作式取消
    if (run.status === RUN_STATUS.running) {
      const cancelled = runManager.cancelRun(run.id)
      if (!cancelled) {
        throw new AppError(409, 'RUN_NOT_CANCELLABLE', 'Run cannot be cancelled at this time', {
          runId: run.id,
          status: run.status,
        })
      }

      return c.json({
        run: store.getRun(run.id),
        note: 'Cancellation signal sent. The run will terminate at the next safe checkpoint.',
      }, 202)
    }

    await withRepoMutex(run.repo, async () => {
      const lock = store.getActiveRepoLock(run.repo)
      if (lock && lock.run_id !== run.id) {
        throw new AppError(409, 'REPO_BUSY', 'Repository is occupied by another active run', {
          activeRunId: lock.run_id,
          repo: run.repo,
        })
      }

      store.deleteRepoLock(run.repo)
      store.updateRunStatus(run.id, RUN_STATUS.cancelled)
    })

    // Clean up run worktree on explicit release (best-effort)
    try {
      cleanupRunWorkspace(config, run.repo, run.id)
    }
    catch {
      // Workspace cleanup is non-critical; log omitted to avoid noise
    }

    const updatedRun = store.getRun(run.id)
    if (updatedRun) {
      bus.publish({
        type: 'run.released',
        runId: updatedRun.id,
        repo: updatedRun.repo,
        taskBranch: updatedRun.task_branch,
        status: updatedRun.status,
      })
    }

    return c.json({
      run: updatedRun,
      workspace: getWorkspaceInfo(config, updatedRun!.repo, store.getActiveRepoLock(updatedRun!.repo)),
    })
  })
}

function normalizeResumeValue(value: string | boolean): string {
  if (value === true || value === false)
    return value ? 'approved' : 'rejected'

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'approved' || normalized === 'approve')
      return 'approved'
    if (normalized === 'rejected' || normalized === 'reject')
      return 'rejected'
  }

  throw new AppError(400, 'INVALID_APPROVAL_DECISION', 'resume or decision must be approved/rejected or boolean')
}
