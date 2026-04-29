export interface UiEvent {
  key: string
  type: string
  message: string
  nodeId?: string
  role?: string
  payload: unknown
  createdAt: string
  isLive: boolean
}

export type EventSummaryTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface AiEventSummary {
  total: number
  status: string
  tone: EventSummaryTone
  latestMessage: string
  latestAt: string
  executorEventCount: number
  acceptanceEventCount: number
}

const EVENT_MESSAGES: Record<string, string> = {
  'connected': 'Connected to event stream',
  'run.acceptance_completed': 'Acceptance completed',
  'run.acceptance_started': 'Acceptance started',
  'run.cancelled': 'Run cancelled',
  'run.completed': 'Run completed',
  'run.continuation_started': 'Continuation started',
  'run.continuation_stopped': 'Continuation stopped',
  'run.executor_completed': 'Executor completed',
  'run.executor_heartbeat': 'Executor still running',
  'run.queued': 'Run queued',
  'run.rejected': 'Run rejected',
  'run.released': 'Run released',
  'run.retry': 'Run retried',
  'run.started': 'Run started',
  'run.waiting_approval': 'Run waiting for approval',
  'run.waiting_continuation': 'Run waiting for continuation',
}

const STATUS_LABELS: Record<string, string> = {
  'connected': 'Connected',
  'run.cancelled': 'Cancelled',
  'run.completed': 'Completed',
  'run.continuation_started': 'Continuing',
  'run.continuation_stopped': 'Stopped',
  'run.failed': 'Failed',
  'run.queued': 'Queued',
  'run.rejected': 'Rejected',
  'run.released': 'Released',
  'run.retry': 'Retrying',
  'run.started': 'Running',
  'run.waiting_approval': 'Waiting for approval',
  'run.waiting_continuation': 'Waiting for continuation',
}

const STATUS_TONES: Record<string, EventSummaryTone> = {
  'connected': 'success',
  'run.cancelled': 'neutral',
  'run.completed': 'success',
  'run.continuation_started': 'info',
  'run.continuation_stopped': 'warning',
  'run.failed': 'danger',
  'run.queued': 'info',
  'run.rejected': 'danger',
  'run.released': 'neutral',
  'run.retry': 'warning',
  'run.started': 'info',
  'run.waiting_approval': 'warning',
  'run.waiting_continuation': 'warning',
}

const REFRESH_AI_EVENT_TYPES = new Set([
  'run.cancelled',
  'run.completed',
  'run.failed',
  'run.rejected',
  'run.released',
  'run.waiting_approval',
  'run.waiting_continuation',
])

const HERMES_OUTPUT_EVENT_TYPES = new Set([
  'run.executor_log',
  'run.executor_progress',
])

export function toUiEvent(raw: any, isLive = false): UiEvent {
  const type = raw.type || 'unknown'
  const message = getEventMessage(type, raw)
  const runId = raw.run_id || raw.runId || ''
  const nodeId = raw.node_id || raw.nodeId || ''
  const role = raw.role || ''
  const createdAt = raw.created_at || raw.createdAt || new Date().toISOString()
  const key = raw.id
    ? String(raw.id)
    : `${runId}-${type}-${message}-${nodeId}-${role}-${createdAt}`

  return {
    key,
    type,
    message,
    nodeId: nodeId || undefined,
    role: role || undefined,
    payload: raw.payload ?? null,
    createdAt,
    isLive,
  }
}

export function summarizeUiEvents(events: UiEvent[]): AiEventSummary {
  const latest = events.at(-1)
  const statusEvent = [...events].reverse().find(event => STATUS_LABELS[event.type])
  const statusType = statusEvent?.type || ''
  const statusLabel = statusType ? STATUS_LABELS[statusType] : undefined

  return {
    total: events.length,
    status: statusLabel || (events.length ? 'Activity' : 'Idle'),
    tone: statusType ? STATUS_TONES[statusType] || 'neutral' : 'neutral',
    latestMessage: latest?.message || 'Waiting for events',
    latestAt: latest?.createdAt || '',
    executorEventCount: events.filter(event => event.type === 'run.executor_log' || event.type === 'run.executor_progress' || event.type === 'run.executor_heartbeat').length,
    acceptanceEventCount: events.filter(event => event.type.startsWith('run.acceptance_')).length,
  }
}

export function shouldRefreshAiState(type: string): boolean {
  return REFRESH_AI_EVENT_TYPES.has(type)
}

export function isHermesOutputEvent(event: Pick<UiEvent, 'type'>): boolean {
  return HERMES_OUTPUT_EVENT_TYPES.has(event.type)
}

export function getHermesOutputText(events: Array<Pick<UiEvent, 'type' | 'message'>>): string {
  return events
    .filter(isHermesOutputEvent)
    .map(event => event.message)
    .join('')
}

function getEventMessage(type: string, raw: any): string {
  if (raw.message)
    return raw.message
  if (type === 'run.executor_log' || type === 'run.executor_progress')
    return raw.log || '[executor log]'
  if (type === 'run.failed')
    return `Run failed: ${raw.error || ''}`.trim()
  return EVENT_MESSAGES[type] || JSON.stringify(raw.payload ?? raw)
}
