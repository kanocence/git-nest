import type { AiRunEvent } from '~/types'

export interface UiEvent {
  key: string
  type: string
  message: string
  nodeId?: string
  role?: string
  payload: any
  createdAt: string
  isLive: boolean
}

export interface ExecutorBudget {
  maxTurns: number | null
  timeoutMs: number | null
  continuationsUsed: number | null
  maxContinuations: number | null
}

function toUiEvent(raw: any, isLive = false): UiEvent {
  const type = raw.type || 'unknown'
  let message = raw.message
  if (!message) {
    if (type === 'run.executor_log')
      message = raw.log || '[executor log]'
    else if (type === 'run.queued')
      message = 'Run queued'
    else if (type === 'run.started')
      message = 'Run started'
    else if (type === 'run.completed')
      message = 'Run completed'
    else if (type === 'run.failed')
      message = `Run failed: ${raw.error || ''}`
    else if (type === 'run.acceptance_started')
      message = 'Acceptance started'
    else if (type === 'run.released')
      message = 'Run released'
    else if (type === 'connected')
      message = 'Connected to event stream'
    else if (type === 'run.waiting_approval')
      message = 'Run waiting for approval'
    else if (type === 'run.waiting_continuation')
      message = 'Run waiting for continuation'
    else message = JSON.stringify(raw.payload ?? raw)
  }
  const runId = raw.run_id || raw.runId || ''
  const nodeId = raw.node_id || raw.nodeId || ''
  const role = raw.role || ''
  const createdAt = raw.created_at || new Date().toISOString()
  const key = raw.id
    ? String(raw.id)
    : `${runId}-${type}-${message}-${nodeId}-${role}`
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

/**
 * 提取执行器预算信息（从事件列表中）
 */
export function useExecutorBudget(events: MaybeRef<AiRunEvent[]>) {
  const eventsRef = toRef(events)
  return computed<ExecutorBudget>(() => {
    const budgetEvent = [...eventsRef.value]
      .reverse()
      .find(event => event.type === 'run.started' || event.type === 'run.retry' || event.type === 'run.continuation_started')
    const payload = budgetEvent?.payload || {}
    return {
      maxTurns: typeof payload.maxTurns === 'number' ? payload.maxTurns : null,
      timeoutMs: typeof payload.timeoutMs === 'number' ? payload.timeoutMs : null,
      continuationsUsed: typeof payload.continuationsUsed === 'number' ? payload.continuationsUsed : null,
      maxContinuations: typeof payload.maxContinuations === 'number' ? payload.maxContinuations : null,
    }
  })
}

/**
 * AI 事件 SSE 订阅和 UI 转换
 * @param options 可选配置
 * @param options.filter 可选的过滤函数，决定哪些事件被保留
 */
export function useAiEvents(options?: {
  filter?: (event: any) => boolean
}) {
  const liveEvents = ref<UiEvent[]>([])
  const { status: sseStatus, data: sseData } = useEventSource('/api/ai/events')

  watch(sseData, (newData) => {
    if (!newData)
      return
    try {
      const event = JSON.parse(newData)
      if (options?.filter && !options.filter(event))
        return
      liveEvents.value.push(toUiEvent(event, true))
      if (liveEvents.value.length > 200)
        liveEvents.value = liveEvents.value.slice(-200)
    }
    catch {
      // ignore parse errors
    }
  })

  const isConnected = computed(() => sseStatus.value === 'OPEN')

  function clearLiveEvents() {
    liveEvents.value = []
  }

  return {
    liveEvents,
    isConnected,
    clearLiveEvents,
    toUiEvent,
  }
}

/**
 * 合并历史事件和实时事件，自动去重
 */
export function useMergedEvents(
  historyEvents: MaybeRef<AiRunEvent[]>,
  liveEvents: MaybeRef<UiEvent[]>,
) {
  const historyRef = toRef(historyEvents)
  const liveRef = toRef(liveEvents)

  const uiHistory = computed(() => historyRef.value.map(e => toUiEvent(e)))

  return computed(() => {
    const historyKeys = new Set(uiHistory.value.map(e => e.key))
    const historyContentKeys = new Set(
      uiHistory.value.map(e => `${e.type}-${e.message}-${e.nodeId || ''}-${e.role || ''}`),
    )
    const newLiveEvents = liveRef.value.filter((e) => {
      if (historyKeys.has(e.key))
        return false
      const contentKey = `${e.type}-${e.message}-${e.nodeId || ''}-${e.role || ''}`
      return !historyContentKeys.has(contentKey)
    })
    return [...uiHistory.value, ...newLiveEvents]
  })
}
