/**
 * GET /api/auth/status
 * 检查当前认证状态
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // 未配置密码 = 无需认证
  if (!config.webPassword) {
    return { authenticated: true, required: false }
  }

  const sessionToken = getCookie(event, 'git-nest-session')
  if (!sessionToken) {
    return { authenticated: false, required: true }
  }

  const crypto = await import('node:crypto')
  const expectedToken = crypto.createHash('sha256').update(config.webPassword).digest('hex')

  return {
    authenticated: await timingSafeEqual(sessionToken, expectedToken),
    required: true,
  }
})
