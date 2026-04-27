import type { AgentRuntime } from '../utils/agent/runtime'

declare module 'h3' {
  interface H3EventContext {
    agent?: AgentRuntime
  }
}

export {}
