/**
 * 仓库名校验（与 runner 端保持一致）
 */
const REPO_NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/

export function validateRepoName(name: string | undefined): string {
  if (!name || !REPO_NAME_RE.test(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid repository name',
    })
  }
  return name
}

/**
 * 时间安全的字符串比较（防止时序攻击）
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const crypto = await import('node:crypto')
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}
