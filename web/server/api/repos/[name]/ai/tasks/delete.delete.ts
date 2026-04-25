export default defineAgentHandler(async (event): Promise<unknown> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const query = getQuery(event)
  const agent = useAgentRuntime(event)

  const filePath = typeof query.filePath === 'string' ? query.filePath : ''
  const ref = typeof query.ref === 'string' && query.ref.trim()
    ? query.ref.trim()
    : getDefaultRef(agent.config, name)

  if (!filePath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'filePath is required',
      data: { code: 'TASK_PATH_REQUIRED' },
    })
  }

  deleteTaskFile(agent.config, name, ref, filePath)
  return { repo: name, ref, filePath, message: 'Task file deleted' }
})
