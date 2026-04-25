export default defineEventHandler(async (event) => {
  const agent = useAgentRuntime(event)

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

      const unsubscribe = agent.events.subscribe((eventPayload) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventPayload)}\n\n`))
        }
        catch {
          unsubscribe()
        }
      })

      event.node.req.on('close', () => {
        unsubscribe()
      })
    },
  })

  return sendStream(event, stream)
})
