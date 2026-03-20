/**
 * GET /api/repos/:name/workspace — 获取 workspace 状态
 */
export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  return await proxyToRunner(`/api/repos/${name}/workspace`)
})
