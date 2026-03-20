/**
 * GET /api/backups
 * 列出所有备份
 */
export default defineEventHandler(async () => {
  return await proxyToRunner<{
    backups: Array<{
      repo: string
      filename: string
      size: number
      createdAt: string
    }>
    total: number
  }>('/api/backups')
})
