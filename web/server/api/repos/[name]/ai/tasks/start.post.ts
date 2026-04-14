export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const body = await readBody(event)
  return await proxyToAgent(`/api/repos/${name}/tasks/start`, {
    method: 'POST',
    body,
  })
})
