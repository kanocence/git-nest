export default defineEventHandler(async (event): Promise<unknown> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const body = await readBody(event)
  return await proxyToAgent(`/api/repos/${name}/tasks/upload`, {
    method: 'POST',
    body,
  })
})
