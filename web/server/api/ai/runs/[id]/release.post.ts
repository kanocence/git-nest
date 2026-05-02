import { isLockedRunStatus, RUN_STATUS } from '#shared/types/agent-status'

export default defineAgentHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run id is required' })
  }

  const agent = useAgentRuntime(event)
  const run = agent.db.runs.get(id)
  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'Run not found', data: { code: 'RUN_NOT_FOUND' } })
  }

  if (!isLockedRunStatus(run.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Only active runs can be released',
      data: { code: 'RUN_NOT_RELEASABLE', runId: run.id, status: run.status },
    })
  }

  if (run.status === RUN_STATUS.running) {
    const cancelled = agent.runManager!.cancelRun(run.id)
    if (!cancelled) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Run cannot be cancelled at this time',
        data: { code: 'RUN_NOT_CANCELLABLE', runId: run.id, status: run.status },
      })
    }

    return {
      run: agent.db.runs.get(id),
      note: 'Cancellation signal sent. The run will terminate at the next safe checkpoint.',
    }
  }

  // Special case: queued run may be waiting in the queue without holding the repo lock.
  // In that case we just cancel the run record without touching the active run's lock.
  if (run.status === RUN_STATUS.queued) {
    await agent.locks.withRepoMutex(run.repo, async () => {
      const lock = agent.db.locks.get(run.repo)
      const holdsLock = lock && lock.run_id === run.id
      if (holdsLock) {
        agent.db.locks.delete(run.repo)
      }
      agent.db.approvalStates.delete(run.id)
      agent.db.runs.updateStatus(run.id, RUN_STATUS.cancelled)
    })

    // Best-effort workspace cleanup (a queued-waiting run has no workspace, but a just-dequeued run might)
    try {
      cleanupRunWorkspace(agent.config, run.repo, run.id)
    }
    catch {
      // Non-critical
    }

    const updatedRun = agent.db.runs.get(run.id)

    // If this run was holding the lock (had just been dequeued), trigger the next queued run
    agent.runManager!.scheduleNextQueuedRun(run.repo)

    if (updatedRun) {
      agent.events.publish({
        type: 'run.released',
        runId: updatedRun.id,
        repo: updatedRun.repo,
        taskBranch: updatedRun.task_branch,
        status: updatedRun.status,
      })
    }

    return {
      run: updatedRun,
      workspace: getWorkspaceInfo(agent.config, run.repo, agent.db.locks.get(run.repo)),
    }
  }

  await agent.locks.withRepoMutex(run.repo, async () => {
    const lock = agent.db.locks.get(run.repo)
    if (lock && lock.run_id !== run.id) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Repository is occupied by another active run',
        data: { code: 'REPO_BUSY', activeRunId: lock.run_id, repo: run.repo },
      })
    }

    agent.db.locks.delete(run.repo)
    agent.db.approvalStates.delete(run.id)
    agent.db.runs.updateStatus(run.id, RUN_STATUS.cancelled)
  })

  // Trigger next queued run after releasing a waiting_approval / waiting_continuation / preparing run
  agent.runManager!.scheduleNextQueuedRun(run.repo)

  // Clean up run worktree on explicit release (best-effort)
  try {
    cleanupRunWorkspace(agent.config, run.repo, run.id)
  }
  catch {
    // Workspace cleanup is non-critical; log omitted to avoid noise
  }

  const updatedRun = agent.db.runs.get(run.id)
  if (updatedRun) {
    agent.events.publish({
      type: 'run.released',
      runId: updatedRun.id,
      repo: updatedRun.repo,
      taskBranch: updatedRun.task_branch,
      status: updatedRun.status,
    })
  }

  return {
    run: updatedRun,
    workspace: getWorkspaceInfo(agent.config, updatedRun!.repo, agent.db.locks.get(updatedRun!.repo)),
  }
})
