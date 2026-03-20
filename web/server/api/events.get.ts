/**
 * GET /api/events
 * SSE 代理 — 转发 git-runner 的推送事件流到前端
 */
export default defineEventHandler(async (event) => {
  const baseUrl = getRunnerBaseUrl()
  const headers = getRunnerHeaders()

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/events`, {
      headers,
    })
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'git-runner is not reachable',
    })
  }

  if (!response.ok || !response.body) {
    throw createError({
      statusCode: response.status || 502,
      statusMessage: 'Failed to connect to event stream',
    })
  }

  // 设置 SSE 响应头
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  // 流式转发
  return sendStream(event, response.body)
})
