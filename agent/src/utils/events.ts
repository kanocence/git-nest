import type { EventPayload } from '../types'

export type EventHandler = (event: EventPayload) => void

export interface EventBus {
  publish: (event: EventPayload) => void
  subscribe: (handler: EventHandler) => () => void
}

export function createEventBus(): EventBus {
  const handlers = new Set<EventHandler>()

  function subscribeHandler(handler: EventHandler): () => void {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  }

  function publish(event: EventPayload) {
    for (const handler of handlers)
      handler(event)
  }

  return {
    publish,
    subscribe: subscribeHandler,
  }
}
