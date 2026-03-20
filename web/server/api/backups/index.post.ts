/**
 * POST /api/backups
 * 手动触发全量备份
 */
export default defineEventHandler(async () => {
  return await proxyToRunner<{
    message: string
    succeeded: number
    failed: number
    backups: Array<{
      repo: string
      filename: string
      size: number
      createdAt: string
    }>
  }>('/api/backups', { method: 'POST' })
})
