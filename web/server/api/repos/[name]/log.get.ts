/**
 * GET /api/repos/:name/log — 获取仓库提交日志
 * Query: ?limit=20
 */
export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const branch = typeof query.branch === 'string' && query.branch.trim()
    ? `&branch=${encodeURIComponent(query.branch.trim())}`
    : ''

  return await proxyToRunner(`/api/repos/${name}/log?limit=${limit}${branch}`)
})
