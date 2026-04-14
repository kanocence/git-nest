export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  return await proxyToAgent(`/api/repos/${name}/workspace-state`)
})
