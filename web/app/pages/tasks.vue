<script setup lang="ts">
import type { UiEvent } from '#shared/utils/ai-events'
import type { AiRunListResponse, AiRunRecord } from '~/types'
import { toUiEvent } from '#shared/utils/ai-events'

definePageMeta({
  layout: 'default',
})

useHead({ title: 'AI Tasks' })

const statusFilter = ref('')
const repoFilter = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [10, 20, 50]
const offset = computed(() => (currentPage.value - 1) * pageSize.value)
const now = useNow({ interval: 1000 })

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'running', 'waiting_approval', 'waiting_continuation'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'system_interrupted'])

const statusOptions = [
  '',
  'queued',
  'preparing',
  'running',
  'waiting_approval',
  'waiting_continuation',
  'completed',
  'failed',
  'cancelled',
  'system_interrupted',
]

const { repos } = useRepos()
const repoOptions = computed(() => ['', ...repos.value.map(repo => repo.name).sort()])

const runsUrl = computed(() => {
  const query = new URLSearchParams({
    limit: String(pageSize.value),
    offset: String(offset.value),
  })
  if (statusFilter.value)
    query.set('status', statusFilter.value)
  if (repoFilter.value)
    query.set('repo', repoFilter.value)
  return `/api/ai/runs?${query.toString()}`
})

const { data, status, error, refresh } = useFetch<AiRunListResponse>(() => runsUrl.value, {
  key: () => `ai-runs-${pageSize.value}-${offset.value}-${statusFilter.value || 'all'}-${repoFilter.value || 'all'}`,
  default: () => ({ runs: [], total: 0, limit: pageSize.value, offset: offset.value }),
  lazy: true,
})

const runs = computed(() => data.value?.runs || [])
const totalRuns = computed(() => data.value?.total || 0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalRuns.value / pageSize.value)))
const loading = computed(() => status.value === 'pending')
const latestRunEvents = ref<Record<string, UiEvent>>({})

const { data: sseData } = useEventSource('/api/ai/events')

// 刷新状态锁
const isRefreshing = ref(false)
const debouncedRefresh = useDebounceFn(async () => {
  if (isRefreshing.value)
    return
  isRefreshing.value = true
  try {
    await refresh()
  }
  finally {
    isRefreshing.value = false
  }
}, 300)

watch(sseData, (newData) => {
  if (!newData)
    return
  try {
    const event = JSON.parse(newData)
    const runId = event.runId || event.run_id
    if (!runId)
      return
    latestRunEvents.value = {
      ...latestRunEvents.value,
      [runId]: toUiEvent(event, true),
    }
    if (['run.completed', 'run.failed', 'run.cancelled', 'run.released', 'run.waiting_approval', 'run.waiting_continuation'].includes(event.type))
      debouncedRefresh()
  }
  catch {
    // ignore malformed event payloads
  }
})

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(createdAt: string, updatedAt: string, status?: string) {
  const end = status && ACTIVE_STATUSES.has(status) ? now.value : new Date(updatedAt)
  const diff = end.getTime() - new Date(createdAt).getTime()
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

function getStatusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'status--success'
    case 'failed':
    case 'system_interrupted':
      return 'status--danger'
    case 'running':
    case 'queued':
    case 'preparing':
      return 'status--info'
    case 'waiting_approval':
    case 'waiting_continuation':
      return 'status--warning'
    case 'cancelled':
    default:
      return 'status--default'
  }
}

function isActiveRun(status: string) {
  return ACTIVE_STATUSES.has(status)
}

function canDeleteRun(status: string) {
  return TERMINAL_STATUSES.has(status)
}

function getRunSummary(run: AiRunRecord) {
  const latestEvent = latestRunEvents.value[run.id]
  if (latestEvent)
    return latestEvent.message
  if (run.last_error)
    return run.last_error
  if (isActiveRun(run.status))
    return 'Waiting for live executor output...'
  return `Last known status: ${run.status}`
}

const runToDelete = ref<string | null>(null)
const deletingRun = ref(false)
const deleteRunError = ref('')
const showDeleteRunConfirm = computed({
  get: () => Boolean(runToDelete.value),
  set: (value: boolean) => {
    if (!value) {
      runToDelete.value = null
      deleteRunError.value = ''
    }
  },
})
const selectedRunToDelete = computed<AiRunRecord | null>(() => {
  if (!runToDelete.value)
    return null
  return runs.value.find(run => run.id === runToDelete.value) || null
})

async function deleteRun() {
  if (!runToDelete.value)
    return
  deletingRun.value = true
  deleteRunError.value = ''
  try {
    await $fetch(`/api/ai/runs/${runToDelete.value}`, { method: 'DELETE' })
    runToDelete.value = null
    await refresh()
  }
  catch (error: any) {
    deleteRunError.value = error?.data?.error || error?.statusMessage || 'Delete run failed'
  }
  finally {
    deletingRun.value = false
  }
}

watch([statusFilter, repoFilter, pageSize], () => {
  currentPage.value = 1
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages)
    currentPage.value = pages
})
</script>

<template>
  <div class="tasks-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="i-carbon-machine-learning-model page-icon" />
          AI Tasks
        </h1>
        <p class="page-subtitle">
          Shared workspace runs and preparation status
        </p>
      </div>
      <ActionButton
        label="Refresh"
        icon="i-carbon-renew"
        variant="secondary"
        :loading="loading || isRefreshing"
        @click="debouncedRefresh()"
      />
    </div>

    <div class="filters">
      <div class="filter-group">
        <label class="filter-label">Status</label>
        <BranchSelector
          v-model="statusFilter"
          :options="[{ value: '', label: 'All' }, ...statusOptions.filter(v => v).map(s => ({ value: s, label: s }))]"
        />
      </div>
      <div class="filter-group">
        <label class="filter-label">Repo</label>
        <BranchSelector
          v-model="repoFilter"
          :options="[{ value: '', label: 'All repos' }, ...repoOptions.filter(v => v).map(r => ({ value: r, label: r }))]"
        />
      </div>
      <button
        v-if="statusFilter || repoFilter"
        class="clear-filters"
        type="button"
        @click="statusFilter = ''; repoFilter = ''"
      >
        Clear filters
      </button>
    </div>

    <div v-if="error" class="alert alert--error">
      Failed to load AI runs.
    </div>

    <div v-else-if="loading" class="loading-state">
      <span>Loading AI runs...</span>
    </div>

    <div v-else-if="runs.length === 0" class="empty-state">
      {{ statusFilter || repoFilter ? 'No runs match the selected filters.' : 'No AI runs yet.' }}
    </div>

    <div v-else class="run-list">
      <div
        v-for="run in runs"
        :key="run.id"
        class="run-card"
        :class="{ 'run-card--active': isActiveRun(run.status) }"
      >
        <div class="run-card-header">
          <div class="run-title-row">
            <NuxtLink :to="`/tasks/${run.id}`" class="run-link">
              {{ run.task_title || run.task_path }}
            </NuxtLink>
            <span
              class="status-badge"
              :class="getStatusClass(run.status)"
            >
              {{ run.status }}
            </span>
          </div>
          <button
            v-if="canDeleteRun(run.status)"
            class="run-delete-btn"
            title="Delete run"
            type="button"
            @click="runToDelete = run.id"
          >
            <span class="i-carbon-trash-can" />
          </button>
        </div>
        <div class="run-meta">
          Repo:
          <NuxtLink :to="`/repos/${run.repo}`" class="repo-link">
            {{ run.repo }}
          </NuxtLink>
        </div>
        <div class="run-meta">
          Branch: <code>{{ run.task_branch }}</code>
        </div>
        <div class="run-meta">
          Duration: {{ formatDuration(run.created_at, run.updated_at, run.status) }}
        </div>
        <div class="run-time">
          Created {{ formatDate(run.created_at) }} · Updated {{ formatDate(run.updated_at) }}
        </div>
        <div class="run-summary" :class="{ 'run-summary--live': Boolean(latestRunEvents[run.id]) }">
          <span class="i-carbon-terminal" />
          <span>{{ getRunSummary(run) }}</span>
        </div>
        <div v-if="run.last_error" class="run-error">
          {{ run.last_error }}
        </div>
      </div>

      <div class="pagination">
        <div class="pagination-nav">
          <button
            :disabled="currentPage <= 1"
            class="pagination-btn"
            type="button"
            @click="currentPage--"
          >
            <span class="i-carbon-chevron-left" />
          </button>
          <span class="pagination-info">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            :disabled="currentPage >= totalPages"
            class="pagination-btn"
            type="button"
            @click="currentPage++"
          >
            <span class="i-carbon-chevron-right" />
          </button>
        </div>
        <div class="pagination-size">
          <span class="run-count">{{ totalRuns }} runs</span>
          <select v-model="pageSize" class="size-select">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }} / page
            </option>
          </select>
        </div>
      </div>
    </div>

    <ModalDialog v-model="showDeleteRunConfirm" title="Delete Run">
      <p>
        Are you sure you want to delete
        <strong>{{ selectedRunToDelete?.task_title || selectedRunToDelete?.task_path || runToDelete }}</strong>?
      </p>
      <p class="warning-text">
        This removes the run record and its saved workspace metadata. Active runs cannot be deleted.
      </p>
      <div v-if="deleteRunError" class="error-text">
        {{ deleteRunError }}
      </div>
      <template #actions>
        <ActionButton
          label="Delete"
          icon="i-carbon-trash-can"
          variant="danger"
          :loading="deletingRun"
          @click="deleteRun"
        />
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.tasks-page {
  max-width: 56rem;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.page-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.page-icon {
  color: var(--color-primary);
}

.page-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-4);
}

.filter-group {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.filter-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.clear-filters {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.alert {
  padding: var(--space-4);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.loading-state {
  text-align: center;
  padding: var(--space-16) 0;
  color: var(--text-muted);
  font-size: var(--font-size-lg);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.empty-state {
  text-align: center;
  padding: var(--space-16) 0;
  color: var(--text-secondary);
}

.run-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.run-card {
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  background-color: var(--bg-surface);
}

.run-card--active {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--color-info) 35%, var(--border-color));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-info) 10%, transparent);
  animation: activeRunGlow 2.4s ease-in-out infinite;
}

.run-card--active > * {
  position: relative;
  z-index: 1;
}

.run-card--active::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 0.25rem;
  pointer-events: none;
  background: var(--color-info);
  opacity: 0.85;
}

.run-card-header {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  justify-content: space-between;
}

.run-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

.run-link {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
  word-break: break-all;
  text-decoration: none;
  transition: text-decoration var(--transition-fast);
}

.run-link:hover {
  text-decoration: underline;
}

.run-delete-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  color: var(--color-danger);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--border-radius-md);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.run-delete-btn:hover {
  background-color: var(--color-danger-light);
  border-color: var(--color-danger-border-subtle);
}

.status-badge {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  white-space: nowrap;
}

.status--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.status--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.status--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.status--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.status--default {
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}

.run-meta {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-2);
  word-break: break-all;
}

.repo-link {
  color: var(--color-primary);
  text-decoration: none;
}

.repo-link:hover {
  text-decoration: underline;
}

.run-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
}

.run-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
  margin-top: var(--space-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.run-summary {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}

.run-summary--live {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.run-summary span:last-child {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.pagination {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-4);
}

.pagination-nav {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.pagination-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  background-color: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.pagination-btn:hover:not(:disabled) {
  background-color: var(--bg-elevated);
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-info {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.pagination-size {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.run-count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.size-select {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

.warning-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin-top: var(--space-2);
}

.error-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin-top: var(--space-2);
}

@keyframes activeRunGlow {
  0%,
  100% {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-info) 10%, transparent);
  }
  50% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-info) 22%, transparent);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .run-card--active,
  .loading-state {
    animation: none;
  }
}
</style>
