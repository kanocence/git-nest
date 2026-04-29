import type { UiEvent } from '#shared/utils/ai-events'
import type { AiRunEvent } from '~/types'
import { toUiEvent } from '#shared/utils/ai-events'

export interface ExecutorBudget {
  maxTurns: number | null
  timeoutMs: number | null
  continuationsUsed: number | null
  maxContinuations: number | null
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
