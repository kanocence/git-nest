import type { RunStatus } from '#shared/types/agent'

const VALID_RUN_STATUSES = new Set<RunStatus>([
  'queued',
  'preparing',
  'running',
  'waiting_approval',
  'waiting_continuation',
  'completed',
  'failed',
  'cancelled',
  'system_interrupted',
])

export default defineAgentHandler(async (event) => {
  const query = getQuery(event)
  const agent = useAgentRuntime()
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const offset = Math.max(Number(query.offset) || 0, 0)
  const requestedStatus = typeof query.status === 'string' ? query.status : ''
  const status = VALID_RUN_STATUSES.has(requestedStatus as RunStatus) ? requestedStatus as RunStatus : null
  const repo = typeof query.repo === 'string' && query.repo.trim() ? query.repo.trim() : null
  const page = agent.db.runs.list({ limit, offset, status, repo })

  return { ...page, limit, offset }
})
