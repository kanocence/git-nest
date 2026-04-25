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

  await agent.locks.withRepoMutex(run.repo, async () => {
    const existingLock = agent.db.locks.get(run.repo)
    if (existingLock && existingLock.run_id !== id) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Repository is occupied by another active run',
        data: { code: 'REPO_BUSY', runId: id, repo: run.repo, activeRunId: existingLock.run_id },
      })
    }

    await agent.runManager!.continueRun(id, 'stop')
  })

  return {
    run: agent.db.runs.get(id),
    note: 'Run has been stopped.',
  }
})
