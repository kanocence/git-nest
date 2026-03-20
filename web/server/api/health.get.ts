/**
 * GET /api/health
 * 检查 git-runner 后端可用性，供前端降级提示使用
 */
export default defineEventHandler(async () => {
  const baseUrl = getRunnerBaseUrl()

  try {
    const response = await $fetch<{
      status: string
      disk?: { totalBytes: number, freeBytes: number, usedBytes: number, usedPct: number }
      warning?: string
    }>(`${baseUrl}/health`, {
      headers: getRunnerHeaders(),
      timeout: 5000,
    })
    return {
      runner: 'ok' as const,
      status: response.status,
      disk: response.disk || null,
      warning: response.warning || null,
    }
  }
  catch {
    return {
      runner: 'unavailable' as const,
      status: 'git-runner is not reachable',
      disk: null,
      warning: null,
    }
  }
})
