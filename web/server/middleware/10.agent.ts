import { useAgentRuntime } from '../utils/agent/runtime'

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname

  // Inject agent runtime for AI-related routes
  if (path.startsWith('/api/ai/') || /^\/api\/repos\/[^/]+\/ai\//.test(path)) {
    event.context.agent = useAgentRuntime()
  }
})
