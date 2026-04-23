<script setup lang="ts">
import type { AiRunListResponse } from '~/types'

definePageMeta({
  layout: 'default',
})

useHead({ title: 'AI Tasks' })

const { data, status, error, refresh } = useFetch<AiRunListResponse>('/api/ai/runs', {
  key: 'ai-runs',
  default: () => ({ runs: [], total: 0 }),
  lazy: true,
})

const runs = computed(() => data.value?.runs || [])
const loading = computed(() => status.value === 'pending')

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

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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

// Filters
const statusFilter = ref('')
const repoFilter = ref('')

const statusOptions = computed(() => {
  const statuses = new Set(runs.value.map(r => r.status))
  return ['', ...Array.from(statuses).sort()]
})

const repoOptions = computed(() => {
  const repos = new Set(runs.value.map(r => r.repo))
  return ['', ...Array.from(repos).sort()]
})

// Pagination
const currentPage = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [10, 20, 50]

const filteredRuns = computed(() => {
  return runs.value.filter((run) => {
    if (statusFilter.value && run.status !== statusFilter.value)
      return false
    if (repoFilter.value && run.repo !== repoFilter.value)
      return false
    return true
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRuns.value.length / pageSize.value)))

const paginatedRuns = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRuns.value.slice(start, start + pageSize.value)
})

// Reset to first page when filters change
watch([statusFilter, repoFilter, pageSize], () => {
  currentPage.value = 1
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

    <!-- Filters -->
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

    <div v-else-if="filteredRuns.length === 0" class="empty-state">
      {{ runs.length === 0 ? 'No AI runs yet.' : 'No runs match the selected filters.' }}
    </div>

    <div v-else class="run-list">
      <div
        v-for="run in paginatedRuns"
        :key="run.id"
        class="run-card"
      >
        <div class="run-card-header">
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
          Duration: {{ formatDuration(run.created_at, run.updated_at) }}
        </div>
        <div class="run-time">
          Created {{ formatDate(run.created_at) }} · Updated {{ formatDate(run.updated_at) }}
        </div>
        <div v-if="run.last_error" class="run-error">
          {{ run.last_error }}
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1 || filteredRuns.length > 10" class="pagination">
        <div class="pagination-nav">
          <button
            :disabled="currentPage <= 1"
            class="pagination-btn"
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
            @click="currentPage++"
          >
            <span class="i-carbon-chevron-right" />
          </button>
        </div>
        <div class="pagination-size">
          <span class="run-count">{{ filteredRuns.length }} runs</span>
          <select v-model="pageSize" class="size-select">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }} / page
            </option>
          </select>
        </div>
      </div>
    </div>
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

.run-card-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
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
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  background-color: var(--bg-surface);
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

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
