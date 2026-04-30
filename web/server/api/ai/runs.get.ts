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
  const rawStatus = typeof query.status === 'string' ? query.status : ''
  const repo = typeof query.repo === 'string' && query.repo.trim() ? query.repo.trim() : null

  // Support comma-separated status list (e.g. "queued,preparing,running")
  const statusParts = rawStatus
    ? rawStatus.split(',').map(s => s.trim()).filter(s => VALID_RUN_STATUSES.has(s as RunStatus)) as RunStatus[]
    : []

  const page = agent.db.runs.list({
    limit,
    offset,
    statuses: statusParts.length > 0 ? statusParts : undefined,
    status: statusParts.length === 1 ? statusParts[0] : null,
    repo,
  })

  return { ...page, limit, offset }
})
