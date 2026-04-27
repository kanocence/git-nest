import type { H3Event } from 'h3'
import type { AgentRuntimeConfig } from './config'
import type { AgentDb } from './db'
import type { AgentEventHub } from './events'
import type { AgentLocks } from './locks'
import type { RunManager } from './run-manager'

export interface AgentRuntime {
  config: AgentRuntimeConfig
  db: AgentDb
  events: AgentEventHub
  locks: AgentLocks
  runManager: RunManager | null
}

export function useAgentRuntime(event?: H3Event): AgentRuntime {
  if (event) {
    const agent = event.context.agent as AgentRuntime | undefined
    if (agent)
      return agent
  }

  const globalRuntime = (globalThis as any).__gitNestAgentRuntime as AgentRuntime | undefined
  if (globalRuntime)
    return globalRuntime

  throw new Error('AgentRuntime is not initialized')
}
