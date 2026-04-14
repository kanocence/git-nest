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

    <div v-if="error" class="text-red-600 mb-4 p-4 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
      Failed to load AI runs.
    </div>

    <div v-else-if="loading" class="text-gray-400 py-16 text-center">
      <span class="text-lg animate-pulse">Loading AI runs...</span>
    </div>

    <div v-else-if="runs.length === 0" class="text-gray-500 py-16 text-center">
      No AI runs yet.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="run in runs"
        :key="run.id"
        class="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
      >
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <NuxtLink :to="`/tasks/${run.id}`" class="text-teal-600 font-600 break-all hover:underline">
            {{ run.task_title || run.task_path }}
          </NuxtLink>
          <span class="text-xs text-gray-600 px-2 py-0.5 rounded-full bg-gray-100 dark:text-gray-300 dark:bg-gray-800">
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
        <div class="text-sm text-gray-500 mt-1 break-all">
          Task file: <code>{{ run.task_path }}</code>
        </div>
        <div class="text-xs text-gray-400 mt-2">
          Updated {{ formatDate(run.updated_at) }}
        </div>
        <div v-if="run.last_error" class="text-xs text-red-600 mt-2 dark:text-red-400">
          {{ run.last_error }}
        </div>
      </div>
    </div>
  </div>
</template>
