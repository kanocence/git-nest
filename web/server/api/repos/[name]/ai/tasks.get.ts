export default defineAgentHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const query = getQuery(event)
  const agent = useAgentRuntime(event)
  const ref = typeof query.ref === 'string' && query.ref.trim()
    ? query.ref.trim()
    : getDefaultRef(agent.config, name)
  const tasks = listTaskFiles(agent.config, name, ref).map((filePath: string) => {
    const content = readTaskFile(agent.config, name, ref, filePath)
    return toTaskSummaryV2(parseTaskDefinitionV2(content, filePath))
  })

  return { repo: name, ref, tasks, total: tasks.length }
})
