<script setup lang="ts">
import type { AiRunListResponse } from '~/types'

definePageMeta({
  layout: 'default',
})

useHead({ title: 'AI Tasks' })

const { data, status, error, refresh } = useFetch<AiRunListResponse>('/api/ai/runs', {
  key: 'ai-runs',
  default: () => ({ runs: [], total: 0 }),
})

const runs = computed(() => data.value?.runs || [])
const loading = computed(() => status.value === 'pending')

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
      return 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30'
    case 'failed':
    case 'system_interrupted':
      return 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30'
    case 'running':
    case 'queued':
    case 'preparing':
      return 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30'
    case 'waiting_approval':
    case 'waiting_continuation':
      return 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30'
    case 'cancelled':
    default:
      return 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800'
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

const filteredRuns = computed(() => {
  return runs.value.filter((run) => {
    if (statusFilter.value && run.status !== statusFilter.value)
      return false
    if (repoFilter.value && run.repo !== repoFilter.value)
      return false
    return true
  })
})
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-700 flex gap-2 items-center">
          <span class="i-carbon-machine-learning-model text-teal-600" />
          AI Tasks
        </h1>
        <p class="text-sm text-gray-500 mt-1">
          Shared workspace runs and preparation status
        </p>
      </div>
      <ActionButton
        label="Refresh"
        icon="i-carbon-renew"
        variant="secondary"
        :loading="loading"
        @click="refresh()"
      />
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap gap-3 items-center">
      <div class="flex gap-2 items-center">
        <label class="text-sm text-gray-500">Status</label>
        <select v-model="statusFilter" class="text-sm px-2 py-1 border border-gray-300 rounded bg-white dark:border-gray-600 dark:bg-gray-800">
          <option value="">
            All
          </option>
          <option v-for="s in statusOptions.filter(v => v)" :key="s" :value="s">
            {{ s }}
          </option>
        </select>
      </div>
      <div class="flex gap-2 items-center">
        <label class="text-sm text-gray-500">Repo</label>
        <select v-model="repoFilter" class="text-sm px-2 py-1 border border-gray-300 rounded bg-white dark:border-gray-600 dark:bg-gray-800">
          <option value="">
            All repos
          </option>
          <option v-for="r in repoOptions.filter(v => v)" :key="r" :value="r">
            {{ r }}
          </option>
        </select>
      </div>
      <button
        v-if="statusFilter || repoFilter"
        class="text-sm text-teal-600 hover:underline"
        @click="statusFilter = ''; repoFilter = ''"
      >
        Clear filters
      </button>
    </div>

    <div v-if="error" class="text-red-600 mb-4 p-4 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
      Failed to load AI runs.
    </div>

    <div v-else-if="loading" class="text-gray-400 py-16 text-center">
      <span class="text-lg animate-pulse">Loading AI runs...</span>
    </div>

    <div v-else-if="filteredRuns.length === 0" class="text-gray-500 py-16 text-center">
      {{ runs.length === 0 ? 'No AI runs yet.' : 'No runs match the selected filters.' }}
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="run in filteredRuns"
        :key="run.id"
        class="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
      >
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <NuxtLink :to="`/tasks/${run.id}`" class="text-teal-600 font-600 break-all hover:underline">
            {{ run.task_title || run.task_path }}
          </NuxtLink>
          <span
            class="text-xs px-2 py-0.5 rounded-full"
            :class="getStatusClass(run.status)"
          >
            {{ run.status }}
          </span>
        </div>
        <div class="text-sm text-gray-500 mt-2">
          Repo:
          <NuxtLink :to="`/repos/${run.repo}`" class="text-teal-600 hover:underline">
            {{ run.repo }}
          </NuxtLink>
        </div>
        <div class="text-sm text-gray-500 mt-1 break-all">
          Branch: <code>{{ run.task_branch }}</code>
        </div>
        <div class="text-sm text-gray-500 mt-1">
          Duration: {{ formatDuration(run.created_at, run.updated_at) }}
        </div>
        <div class="text-xs text-gray-400 mt-2">
          Created {{ formatDate(run.created_at) }} · Updated {{ formatDate(run.updated_at) }}
        </div>
        <div v-if="run.last_error" class="text-xs text-red-600 mt-2 line-clamp-2 dark:text-red-400">
          {{ run.last_error }}
        </div>
      </div>
    </div>
  </div>
</template>
