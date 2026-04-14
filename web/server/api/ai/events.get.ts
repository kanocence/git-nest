export default defineEventHandler(async (event) => {
  const baseUrl = getAgentBaseUrl()
  const headers = getAgentHeaders()

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/events`, {
      headers,
    })
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'agent is not reachable',
    })
  }

  if (!response.ok || !response.body) {
    throw createError({
      statusCode: response.status || 502,
      statusMessage: 'Failed to connect to agent event stream',
    })
  }

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  return sendStream(event, response.body)
})
