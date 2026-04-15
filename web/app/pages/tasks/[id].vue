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

// code-server 链接
const { public: { codeServerUrl } } = useRuntimeConfig()
const codeServerEditorUrl = computed(() => {
  if (!codeServerUrl || !run.value?.workspace_path)
    return ''
  const base = codeServerUrl.replace(/\/$/, '')
  // 从 workspace_path 提取仓库名称
  const repoName = run.value.repo
  return `${base}/?folder=/workspace/${repoName}`
})

// SSE 实时事件订阅
const liveEvents = ref<UiEvent[]>([])
const eventsContainerRef = ref<HTMLElement | null>(null)
const { status: sseStatus, data: sseData } = useEventSource('/api/ai/events')

// 监听 SSE 数据变化
watch(sseData, (newData) => {
  if (!newData)
    return
  try {
    const event = JSON.parse(newData)
    // 只处理当前 run 的事件（connected 全局事件也显示）
    if (event.runId === id.value || event.run_id === id.value || event.type === 'connected') {
      liveEvents.value.push(toUiEvent(event, true))
      if (liveEvents.value.length > 200)
        liveEvents.value = liveEvents.value.slice(-200)
      // 自动刷新详情以获取最新状态
      refresh()
      // 滚动到底部
      nextTick(() => {
        if (eventsContainerRef.value)
          eventsContainerRef.value.scrollTop = eventsContainerRef.value.scrollHeight
      })
    }
  }
  catch {
    // ignore parse errors
  }
})

// 合并历史事件和实时事件（基于 key 和内容去重）
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

// 操作状态
const actionLoading = ref<string | null>(null)
const actionError = ref('')
const actionSuccess = ref('')

// 状态判断
const isWaitingApproval = computed(() => run.value?.status === 'waiting_approval')
const isSystemInterrupted = computed(() => run.value?.status === 'system_interrupted')
const isTerminal = computed(() => {
  if (!run.value)
    return false
  return ['completed', 'failed', 'cancelled'].includes(run.value.status)
})
const canDeleteTaskBranch = computed(() => Boolean(isTerminal.value && run.value?.task_branch?.startsWith('ai/')))

// 执行操作
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

// 删除任务分支
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

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(createdAt: string, updatedAt: string) {
  const diff = new Date(updatedAt).getTime() - new Date(createdAt).getTime()
  if (diff < 0)
    return ''
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0)
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0)
    return `${hours}h ${minutes % 60}m`
  if (minutes > 0)
    return `${minutes}m`
  return `${Math.floor(diff / 1000)}s`
}

// 状态标签样式
function getStatusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30'
    case 'failed':
    case 'system_interrupted':
      return 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30'
    case 'waiting_approval':
      return 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30'
    case 'running':
    case 'queued':
    case 'preparing':
      return 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30'
    case 'cancelled':
    default:
      return 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800'
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-6 flex gap-3 items-center justify-between">
      <div>
        <NuxtLink to="/tasks" class="text-sm text-gray-500 hover:text-teal-600">
          ← Back to AI Tasks
        </NuxtLink>
        <h1 class="text-2xl font-700 mt-2">
          {{ run?.task_title || run?.task_path || id }}
        </h1>
        <p class="text-sm text-gray-500 mt-1">
          Run ID: <code>{{ id }}</code>
        </p>
      </div>
      <div class="flex gap-2 items-center">
        <span
          v-if="isSseConnected"
          class="text-xs text-green-600 px-2 py-0.5 rounded-full bg-green-100 dark:text-green-400 dark:bg-green-900/30"
        >
          ● Live
        </span>
        <ActionButton
          label="Refresh"
          icon="i-carbon-renew"
          variant="secondary"
          :loading="loading"
          @click="refresh()"
        />
      </div>
    </div>

    <div v-if="error" class="text-red-600 p-4 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
      Failed to load AI run details.
    </div>

    <div v-else-if="loading && !run" class="text-gray-400 py-16 text-center">
      Loading AI run...
    </div>

    <template v-else-if="run">
      <!-- 操作反馈 -->
      <div v-if="actionError" class="text-sm text-red-600 mb-4 p-3 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
        {{ actionError }}
      </div>
      <div v-if="actionSuccess" class="text-sm text-green-600 mb-4 p-3 rounded-lg bg-green-50 dark:text-green-400 dark:bg-green-900/20">
        {{ actionSuccess }}
      </div>

      <!-- 状态操作按钮 -->
      <div v-if="!isTerminal || canDeleteTaskBranch" class="mb-6 p-4 border border-gray-200 rounded-lg dark:border-gray-700">
        <div class="text-sm font-600 mb-3">
          Actions
        </div>
        <div class="flex flex-wrap gap-2">
          <template v-if="isWaitingApproval">
            <ActionButton
              label="Approve"
              icon="i-carbon-checkmark"
              :loading="actionLoading === 'approve'"
              @click="executeAction('approve')"
            />
            <ActionButton
              label="Reject"
              icon="i-carbon-close"
              variant="danger"
              :loading="actionLoading === 'reject'"
              @click="executeAction('reject')"
            />
          </template>
          <ActionButton
            v-if="isSystemInterrupted"
            label="Retry"
            icon="i-carbon-reset"
            :loading="actionLoading === 'retry'"
            @click="executeAction('retry')"
          />
          <ActionButton
            v-if="['running', 'queued', 'preparing'].includes(run.status)"
            label="Release"
            icon="i-carbon-close"
            variant="danger"
            :loading="actionLoading === 'release'"
            @click="executeAction('release')"
          />
          <ActionButton
            v-if="canDeleteTaskBranch"
            label="Delete Task Branch"
            icon="i-carbon-trash-can"
            variant="danger"
            :loading="deletingBranch"
            @click="showDeleteBranchConfirm = true"
          />
        </div>
      </div>

      <!-- code-server 提示 -->
      <div v-if="codeServerEditorUrl" class="mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex gap-3 items-start">
          <span class="i-carbon-information text-xl text-blue-600 mt-0.5 dark:text-blue-400" />
          <div class="flex-1">
            <div class="text-sm text-blue-900 font-600 dark:text-blue-100">
              在 code-server 中查看变更
            </div>
            <p class="text-sm text-blue-800 mt-1 dark:text-blue-200">
              AI 任务已在工作区中创建了变更。请在 code-server 中查看完整的代码差异和审查变更。
            </p>
            <a
              :href="codeServerEditorUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-white mt-3 px-4 py-2 rounded-md bg-blue-600 inline-flex gap-1.5 transition-colors items-center hover:bg-blue-700"
            >
              <span class="i-carbon-code" />
              打开 code-server
            </a>
          </div>
        </div>
      </div>

      <div class="mb-6 gap-4 grid md:grid-cols-2">
        <div class="p-4 border border-gray-200 rounded-lg dark:border-gray-700">
          <div class="text-xs text-gray-500">
            Repo
          </div>
          <NuxtLink :to="`/repos/${run.repo}`" class="text-teal-600 mt-1 block hover:underline">
            {{ run.repo }}
          </NuxtLink>
          <div class="text-xs text-gray-500 mt-4">
            Status
          </div>
          <div
            class="text-xs font-600 mt-1 px-2 py-0.5 rounded-full inline-block"
            :class="getStatusClass(run.status)"
          >
            {{ run.status }}
          </div>
          <div class="text-xs text-gray-500 mt-4">
            Task File
          </div>
          <code class="text-sm mt-1 block break-all">{{ run.task_path || '-' }}</code>
        </div>

        <div class="p-4 border border-gray-200 rounded-lg dark:border-gray-700">
          <div class="text-xs text-gray-500">
            Branch
          </div>
          <code class="text-sm mt-1 block break-all">{{ run.task_branch || '-' }}</code>
          <div class="text-xs text-gray-500 mt-4">
            Workspace
          </div>
          <code class="text-sm mt-1 block break-all">{{ run.workspace_path || '-' }}</code>
          <div class="text-xs text-gray-500 mt-4">
            Created
          </div>
          <div class="text-sm mt-1">
            {{ formatDate(run.created_at) }}
          </div>
          <div class="text-xs text-gray-500 mt-4">
            Duration
          </div>
          <div class="text-sm mt-1">
            {{ formatDuration(run.created_at, run.updated_at) || '-' }}
          </div>
          <div v-if="run.max_iterations != null" class="text-xs text-gray-500 mt-4">
            Iteration
          </div>
          <div v-if="run.max_iterations != null" class="text-sm mt-1">
            {{ run.current_iteration || 0 }} / {{ run.max_iterations }}
          </div>
        </div>
      </div>

      <div v-if="run.last_error" class="text-sm text-red-600 mb-6 p-4 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
        {{ run.last_error }}
      </div>

      <!-- Events -->
      <div class="border border-gray-200 rounded-lg dark:border-gray-700">
        <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between dark:border-gray-700">
          <h2 class="text-lg font-600">
            Events
          </h2>
          <span class="text-xs text-gray-500">
            {{ allEvents.length }} events
          </span>
        </div>
        <div v-if="allEvents.length === 0" class="text-sm text-gray-500 p-6">
          No events recorded yet.
        </div>
        <div
          v-else
          ref="eventsContainerRef"
          class="max-h-96 overflow-auto divide-gray-100 divide-y dark:divide-gray-800"
        >
          <div
            v-for="event in allEvents"
            :key="event.key"
            class="p-4 transition-colors"
            :class="{ 'bg-blue-50/50 dark:bg-blue-900/10': event.isLive }"
          >
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <div class="font-600">
                {{ event.message }}
              </div>
              <div class="text-xs text-gray-400">
                {{ formatDate(event.createdAt) }}
              </div>
            </div>
            <div class="text-xs text-gray-500 mt-2">
              <span>{{ event.type }}</span>
              <span v-if="event.nodeId"> · node <code>{{ event.nodeId }}</code></span>
              <span v-if="event.role"> · {{ event.role }}</span>
            </div>
            <pre
              v-if="event.payload"
              class="text-xs text-gray-700 mt-3 p-3 rounded bg-gray-50 overflow-x-auto dark:text-gray-300 dark:bg-gray-900"
            >{{ JSON.stringify(event.payload, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- Delete Branch Confirmation -->
      <ModalDialog v-model="showDeleteBranchConfirm" title="Delete Task Branch">
        <p>
          Are you sure you want to delete branch <strong>{{ run.task_branch }}</strong>?
        </p>
        <p class="text-sm text-red-500 mt-2">
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
