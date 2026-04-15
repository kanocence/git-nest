export default defineEventHandler(async (event): Promise<unknown> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const query = getQuery(event)
  const filePath = typeof query.filePath === 'string' ? query.filePath : ''
  const params = new URLSearchParams({ filePath })
  if (typeof query.ref === 'string' && query.ref.trim())
    params.set('ref', query.ref.trim())

  return await proxyToAgent(`/api/repos/${name}/tasks/delete?${params.toString()}`, {
    method: 'DELETE',
  })
})
