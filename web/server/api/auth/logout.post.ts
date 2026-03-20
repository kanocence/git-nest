/**
 * POST /api/auth/logout
 * 清除 session cookie
 */
export default defineEventHandler(async (event) => {
  deleteCookie(event, 'git-nest-session')
  return { success: true }
})
