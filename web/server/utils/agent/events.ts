import type { EventPayload } from '#shared/types/agent'

export type AgentEventHandler = (event: EventPayload) => void

export interface AgentEventHub {
  publish: (event: EventPayload) => void
  subscribe: (handler: AgentEventHandler) => () => void
}

export function createAgentEventHub(): AgentEventHub {
  const handlers = new Set<AgentEventHandler>()

  function subscribe(handler: AgentEventHandler): () => void {
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
    subscribe,
  }
}
