/**
 * 推送事件 composable
 * 订阅 SSE 事件流，收到 push 事件时自动刷新相关数据
 */
export function usePushEvents(options?: {
  onPush?: (event: { repo: string, ref: string, timestamp: string }) => void
}) {
  const lastEvent = ref<{ repo: string, ref: string, timestamp: string } | null>(null)
  const connected = ref(false)

  let eventSource: EventSource | null = null

  function connect() {
    if (import.meta.server)
      return

    eventSource = new EventSource('/api/events')

    eventSource.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)

        if (data.type === 'connected') {
          connected.value = true
          return
        }

        if (data.type === 'push') {
          lastEvent.value = {
            repo: data.repo,
            ref: data.ref,
            timestamp: data.timestamp,
          }
          options?.onPush?.(lastEvent.value)
        }
      }
      catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      connected.value = false
      // EventSource 会自动重连
    }
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
      connected.value = false
    }
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    lastEvent,
    connected,
  }
}
