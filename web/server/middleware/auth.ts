/**
 * Nuxt Server 认证中间件
 * 基于 cookie 的简单密码认证，保护所有页面和 API
 *
 * 环境变量 WEB_PASSWORD 为空时跳过认证（开发模式）
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  // 静态资源和内部路由不需要认证
  if (
    path.startsWith('/_nuxt/')
    || path.startsWith('/__nuxt')
    || path === '/favicon.ico'
    || path.startsWith('/robots.txt')
    || path === '/login'
    || path === '/api/auth/login'
    || path === '/api/auth/status'
    || path === '/api/auth/logout'
  ) {
    return
  }

  const config = useRuntimeConfig()
  const password = config.webPassword

  // 未配置密码 = 开放访问
  if (!password) {
    return
  }

  // 检查 cookie
  const sessionToken = getCookie(event, 'git-nest-session')
  if (!sessionToken) {
    // API 请求返回 401
    if (path.startsWith('/api/')) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required',
      })
    }
    // 页面请求重定向到登录页
    return sendRedirect(event, '/login')
  }

  // 验证 token（简单 HMAC：密码的 SHA-256）
  const crypto = await import('node:crypto')
  const expectedToken = crypto.createHash('sha256').update(password).digest('hex')

  if (!await timingSafeEqual(sessionToken, expectedToken)) {
    deleteCookie(event, 'git-nest-session')
    if (path.startsWith('/api/')) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid session',
      })
    }
    return sendRedirect(event, '/login')
  }
})
