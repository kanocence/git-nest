/**
 * POST /api/repos — 创建新仓库
 * Body: { name: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await proxyToRunner('/api/repos', {
    method: 'POST',
    body: { name: body?.name },
  })
})
