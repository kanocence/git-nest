export default defineAgentHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Run id is required',
    })
  }

  const agent = useAgentRuntime(event)
  const run = agent.db.runs.get(id)
  if (!run) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Run not found',
      data: { code: 'RUN_NOT_FOUND' },
    })
  }

  return {
    run,
    events: agent.db.events.listByRun(id, 5000),
    workspace: getWorkspaceInfo(agent.config, run.repo, agent.db.locks.get(run.repo)),
  }
})
