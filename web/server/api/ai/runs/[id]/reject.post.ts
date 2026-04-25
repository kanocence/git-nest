export default defineAgentHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run id is required' })
  }

  const agent = useAgentRuntime(event)
  await agent.runManager!.resumeRun(id, 'rejected')

  return {
    run: agent.db.runs.get(id),
    note: 'Run has been rejected and will be terminated.',
  }
})
