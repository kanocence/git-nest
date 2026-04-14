/**
 * 获取 agent 的完整 URL
 */
export function getAgentBaseUrl(): string {
  const config = useRuntimeConfig()
  return `http://${config.agentHost}:${config.agentPort}`
}

/**
 * 获取 agent 请求所需的认证 headers
 */
export function getAgentHeaders(): Record<string, string> {
  const config = useRuntimeConfig()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.agentSecret) {
    headers.Authorization = `Bearer ${config.agentSecret}`
  }
  return headers
}

/**
 * 代理请求到 agent
 */
export async function proxyToAgent<T>(
  path: string,
  options: {
    method?: string
    body?: any
  } = {},
): Promise<T> {
  const baseUrl = getAgentBaseUrl()
  const url = `${baseUrl}${path}`

  try {
    const response = await $fetch<T>(url, {
      method: (options.method || 'GET') as any,
      headers: getAgentHeaders(),
      body: options.body,
    })
    return response as T
  }
  catch (error: any) {
    const statusCode = error?.statusCode || error?.status || 502
    const data = error?.data || { error: 'agent unavailable', code: 'AGENT_UNAVAILABLE' }
    throw createError({
      statusCode,
      statusMessage: data.error || 'agent error',
      data,
    })
  }
}
