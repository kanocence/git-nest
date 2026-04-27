import { RUN_STATUS } from '#shared/types/agent-status'

export default defineAgentHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const body = await readBody(event)
  const requestedTaskPath = typeof body.taskPath === 'string' ? body.taskPath.trim() : ''

  if (!requestedTaskPath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'taskPath is required',
      data: { code: 'TASK_PATH_REQUIRED' },
    })
  }

  const agent = useAgentRuntime(event)
  const sourceRef = typeof body.ref === 'string' && body.ref.trim()
    ? body.ref.trim()
    : getDefaultRef(agent.config, name)

  const tasks = listTaskFiles(agent.config, name, sourceRef)
  const taskPath = tasks.find((item: string) => item === requestedTaskPath)
  if (!taskPath) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task YAML not found in repository',
      data: { code: 'TASK_NOT_FOUND', repo: name, taskPath: requestedTaskPath, ref: sourceRef },
    })
  }

  const content = readTaskFile(agent.config, name, sourceRef, taskPath)
  const task = parseTaskDefinitionV2(content, taskPath)

  // Validate task before creating run
  if (!task.valid) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Task YAML failed validation',
      data: {
        code: 'INVALID_TASK_YAML',
        path: taskPath,
        errors: task.validationErrors,
        parseError: task.parseError,
      },
    })
  }

  const runId = createRunId()
  const taskBranch = `ai/${runId}`
  const baseBranch = task.baseBranch || getDefaultRef(agent.config, name)

  const run = await agent.locks.withRepoMutex(name, async () => {
    const activeLock = agent.db.locks.get(name)
    if (activeLock) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Repository workspace is already occupied by an AI task',
        data: {
          code: 'REPO_BUSY',
          runId: activeLock.run_id,
          branch: activeLock.task_branch,
        },
      })
    }

    const now = new Date().toISOString()
    const workspacePath = getRunWorkspacePath(agent.config, name, runId)
    agent.db.runs.create({
      id: runId,
      repo: name,
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
    agent.db.runWorkspaces.create({ runId, repo: name, workspacePath })

    agent.db.locks.upsert({
      repo: name,
      runId,
      taskBranch,
      status: RUN_STATUS.preparing,
      lockedAt: now,
      updatedAt: now,
    })

    try {
      ensureRunWorkspace(agent.config, name, runId, baseBranch, taskBranch)
      agent.db.runs.updateStatus(runId, RUN_STATUS.queued)
      agent.db.locks.upsert({
        repo: name,
        runId,
        taskBranch,
        status: RUN_STATUS.queued,
        lockedAt: now,
        updatedAt: new Date().toISOString(),
      })

      return agent.db.runs.get(runId)
    }
    catch (error: any) {
      agent.db.runs.updateStatus(runId, RUN_STATUS.failed, error instanceof Error ? error.message : 'Unknown error')
      agent.db.locks.delete(name)
      throw error
    }
  })

  if (!run) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create run',
      data: { code: 'RUN_CREATION_FAILED' },
    })
  }

  agent.events.publish({
    type: 'run.queued',
    runId: run.id,
    repo: run.repo,
    taskPath: run.task_path,
    taskBranch: run.task_branch,
    status: run.status,
    workspacePath: run.workspace_path,
  })

  agent.runManager!.startRun(run.id).catch((error: any) => {
    console.error('[routes] startRun failed:', error)
  })

  setResponseStatus(event, 202)
  return {
    run,
    workspace: getWorkspaceInfo(agent.config, name, agent.db.locks.get(name)),
    note: 'The shared workspace and task branch are prepared. Background execution starts automatically.',
  }
})
