/**
 * POST /api/auth/login
 * 验证密码并设置 session cookie
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ password: string }>(event)

  if (!body?.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password is required',
    })
  }

  const config = useRuntimeConfig()
  const expectedPassword = config.webPassword

  if (!expectedPassword) {
    // 未配置密码，直接通过
    return { success: true }
  }

  // 使用 timing-safe 比较防止时序攻击
  const crypto = await import('node:crypto')
  const inputHash = crypto.createHash('sha256').update(body.password).digest('hex')
  const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(expectedHash))) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid password',
    })
  }

  // 设置 session cookie（SHA-256 of password）
  const token = expectedHash // 已计算过，直接复用

  setCookie(event, 'git-nest-session', token, {
    httpOnly: true,
    secure: false, // NAS 内网通常无 HTTPS，如有反向代理可改为 true
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 天
    path: '/',
  })

  return { success: true }
})
