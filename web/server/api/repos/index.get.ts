/**
 * GET /api/repos — 列出所有仓库
 */
export default defineEventHandler(async () => {
  return await proxyToRunner('/api/repos')
})
