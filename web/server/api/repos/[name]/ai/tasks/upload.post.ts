export default defineAgentHandler(async (event): Promise<unknown> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const body = await readBody(event)
  const agent = useAgentRuntime(event)

  const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : ''
  const content = typeof body.content === 'string' ? body.content : ''
  const ref = typeof body.ref === 'string' && body.ref.trim()
    ? body.ref.trim()
    : getDefaultRef(agent.config, name)

  if (!filePath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'filePath is required',
      data: { code: 'TASK_PATH_REQUIRED' },
    })
  }

  writeTaskFile(agent.config, name, ref, filePath, content)
  return { repo: name, ref, filePath, message: 'Task file uploaded' }
})
