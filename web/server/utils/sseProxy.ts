/**
 * SSE Proxy Utility — 代理 git-runner 的 SSE 流式响应
 */
import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

export interface SSEProxyOptions {
  event: H3Event
  baseUrl: string
  path: string
  gitRunnerSecret: string
  method?: string
  body?: unknown
}

/**
 * 创建 SSE 代理请求，自动处理流式转发和客户端断开
 */
export async function createSSEProxy(options: SSEProxyOptions): Promise<void> {
  const { event, baseUrl, path, gitRunnerSecret, method = 'POST', body } = options

  const headers: Record<string, string> = {}
  if (gitRunnerSecret) {
    headers.Authorization = `Bearer ${gitRunnerSecret}`
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const signal = controller.signal

  // 监听客户端断开，自动终止向后端的 fetch 请求
  event.node.req.on('close', () => {
    controller.abort()
  })

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  }
  catch (err: any) {
    if (err.name === 'AbortError') {
      return
    }
    throw err
  }

  if (!response.ok || !response.body) {
    throw new Error(`Failed to connect to git-runner: ${response.status}`)
  }

  // 设置 SSE headers
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      const chunk = decoder.decode(value, { stream: true })
      event.node.res.write(chunk)
      if (typeof (event.node.res as any).flush === 'function') {
        (event.node.res as any).flush()
      }
    }
  }
  catch (err: any) {
    if (err.name !== 'AbortError') {
      throw err
    }
  }
  finally {
    event.node.res.end()
  }
}
