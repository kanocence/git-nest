/**
 * DELETE /api/repos/:name — 删除仓库
 */
export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))

  return await proxyToRunner(`/api/repos/${name}`, {
    method: 'DELETE',
  })
})
