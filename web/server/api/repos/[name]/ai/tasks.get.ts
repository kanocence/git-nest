export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const query = getQuery(event)
  const ref = typeof query.ref === 'string' ? `?ref=${encodeURIComponent(query.ref)}` : ''
  return await proxyToAgent(`/api/repos/${name}/tasks${ref}`)
})
