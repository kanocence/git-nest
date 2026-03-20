/**
 * 获取 git-runner 的完整 URL
 */
export function getRunnerBaseUrl(): string {
  const config = useRuntimeConfig()
  return `http://${config.gitRunnerHost}:${config.gitRunnerPort}`
}

/**
 * 获取 git-runner 请求所需的认证 headers
 */
export function getRunnerHeaders(): Record<string, string> {
  const config = useRuntimeConfig()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.gitRunnerSecret) {
    headers.Authorization = `Bearer ${config.gitRunnerSecret}`
  }
  return headers
}

/**
 * 代理请求到 git-runner
 */
export async function proxyToRunner<T>(
  path: string,
  options: {
    method?: string
    body?: any
  } = {},
): Promise<T> {
  const baseUrl = getRunnerBaseUrl()
  const url = `${baseUrl}${path}`

  try {
    const response = await $fetch<T>(url, {
      method: (options.method || 'GET') as any,
      headers: getRunnerHeaders(),
      body: options.body,
    })
    return response as T
  }
  catch (error: any) {
    // 转换 git-runner 的错误为 Nitro 的 HTTP 错误
    const statusCode = error?.statusCode || error?.status || 502
    const data = error?.data || { error: 'git-runner unavailable', code: 'RUNNER_UNAVAILABLE' }
    throw createError({
      statusCode,
      statusMessage: data.error || 'git-runner error',
      data,
    })
  }
}
