export default defineAgentHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const agent = useAgentRuntime(event)
  const lock = agent.db.locks.get(name)
  const workspace = getWorkspaceInfo(agent.config, name, lock)

  return {
    ...workspace,
    lockStatus: lock?.status || null,
    lockUpdatedAt: lock?.updated_at || null,
  }
})
