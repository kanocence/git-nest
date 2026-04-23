<script setup lang="ts">
import type { AiRunDetailResponse } from '~/types'

definePageMeta({
  layout: 'default',
})

const route = useRoute('tasks-id')
const id = computed(() => route.params.id as string)

useHead({
  title: () => `AI Run ${id.value}`,
})

const { data, status, error, refresh } = useFetch<AiRunDetailResponse>(
  () => `/api/ai/runs/${id.value}`,
  {
    key: () => `ai-run-${id.value}`,
  },
)

const loading = computed(() => status.value === 'pending')
const run = computed(() => data.value?.run || null)
const events = computed(() => data.value?.events || [])

// Executor budget from events
const executorBudget = computed(() => {
  const budgetEvent = [...events.value]
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

// Event transformation
interface UiEvent {
  key: string
  type: string
  message: string
  nodeId?: string
  role?: string
  payload: any
  createdAt: string
  isLive: boolean
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

const uiEvents = computed(() => events.value.map(e => toUiEvent(e)))

// SSE live events
const liveEvents = ref<UiEvent[]>([])
const { status: sseStatus, data: sseData } = useEventSource('/api/ai/events')

watch(sseData, (newData) => {
  if (!newData)
    return
  try {
    const event = JSON.parse(newData)
    if (event.runId === id.value || event.run_id === id.value || event.type === 'connected') {
      liveEvents.value.push(toUiEvent(event, true))
      if (liveEvents.value.length > 200)
        liveEvents.value = liveEvents.value.slice(-200)
      refresh()
    }
  }
  catch {
    // ignore parse errors
  }
})

const allEvents = computed(() => {
  const historyKeys = new Set(uiEvents.value.map(e => e.key))
  const historyContentKeys = new Set(
    uiEvents.value.map(e => `${e.type}-${e.message}-${e.nodeId || ''}-${e.role || ''}`),
  )
  const newLiveEvents = liveEvents.value.filter((e) => {
    if (historyKeys.has(e.key))
      return false
    const contentKey = `${e.type}-${e.message}-${e.nodeId || ''}-${e.role || ''}`
    return !historyContentKeys.has(contentKey)
  })
  return [...uiEvents.value, ...newLiveEvents]
})

const isSseConnected = computed(() => sseStatus.value === 'OPEN')

// Actions
const actionLoading = ref<string | null>(null)
const actionError = ref('')
const actionSuccess = ref('')

async function executeAction(action: string) {
  actionLoading.value = action
  actionError.value = ''
  actionSuccess.value = ''

  try {
    await $fetch(`/api/ai/runs/${id.value}/${action}`, {
      method: 'POST',
    })
    actionSuccess.value = `${action} successful`
    await refresh()
  }
  catch (err: any) {
    actionError.value = err?.data?.error || err?.message || `${action} failed`
  }
  finally {
    actionLoading.value = null
  }
}

// Delete task branch
const showDeleteBranchConfirm = ref(false)
const deletingBranch = ref(false)

async function deleteTaskBranch() {
  if (!run.value)
    return
  deletingBranch.value = true
  actionError.value = ''
  actionSuccess.value = ''
  try {
    await $fetch(`/api/repos/${run.value.repo}/branches/delete`, {
      method: 'POST',
      body: { branch: run.value.task_branch },
    })
    actionSuccess.value = 'Task branch deleted'
    showDeleteBranchConfirm.value = false
  }
  catch (err: any) {
    actionError.value = err?.data?.error || err?.message || 'Delete branch failed'
  }
  finally {
    deletingBranch.value = false
  }
}

// Code server URL
const { public: { codeServerUrl } } = useRuntimeConfig()
const codeServerEditorUrl = computed(() => {
  if (!codeServerUrl || !run.value?.workspace_path)
    return ''
  const base = codeServerUrl.replace(/\/$/, '')
  return `${base}/?folder=/workspace/${run.value.repo}`
})
</script>

<template>
  <div class="run-detail">
    <RunHeader
      :id="id"
      :title="run?.task_title"
      :loading="loading"
      :is-sse-connected="isSseConnected"
      @refresh="refresh()"
    />

    <div v-if="error" class="alert alert--error">
      Failed to load AI run details.
    </div>

    <div v-else-if="loading && !run" class="loading-state">
      Loading AI run...
    </div>

    <template v-else-if="run">
      <!-- Action feedback -->
      <div v-if="actionError" class="alert alert--error">
        {{ actionError }}
      </div>
      <div v-if="actionSuccess" class="alert alert--success">
        {{ actionSuccess }}
      </div>

      <!-- Actions -->
      <RunActions
        :run="run"
        :action-loading="actionLoading"
        :deleting-branch="deletingBranch"
        @action="executeAction"
        @delete-branch="showDeleteBranchConfirm = true"
      />

      <!-- Code Server Banner -->
      <CodeServerBanner v-if="codeServerEditorUrl" :editor-url="codeServerEditorUrl" />

      <!-- Info Panel -->
      <RunInfoPanel :run="run" :executor-budget="executorBudget" />

      <!-- Last Error -->
      <div v-if="run.last_error" class="alert alert--error">
        {{ run.last_error }}
      </div>

      <!-- Events -->
      <EventList :events="allEvents" />

      <!-- Delete Branch Confirmation -->
      <ModalDialog v-model="showDeleteBranchConfirm" title="Delete Task Branch">
        <p>
          Are you sure you want to delete branch <strong>{{ run.task_branch }}</strong>?
        </p>
        <p class="warning-text">
          This action cannot be undone.
        </p>
        <template #actions>
          <ActionButton
            label="Delete"
            icon="i-carbon-trash-can"
            variant="danger"
            :loading="deletingBranch"
            @click="deleteTaskBranch"
          />
        </template>
      </ModalDialog>
    </template>
  </div>
</template>

<style scoped>
.run-detail {
  max-width: 64rem;
  margin: 0 auto;
}

.alert {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.alert--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.loading-state {
  text-align: center;
  padding: var(--space-16) 0;
  color: var(--text-muted);
  font-size: var(--font-size-lg);
}

.warning-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin-top: var(--space-2);
}
</style>
