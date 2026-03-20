<script setup lang="ts">
import type { CommitInfo } from '~/types'

defineProps<{
  commits: CommitInfo[]
  loading?: boolean
}>()
</script>

<template>
  <div>
    <div v-if="loading" class="text-center py-8 text-gray-400">
      <span class="animate-pulse">Loading commits...</span>
    </div>

    <div v-else-if="commits.length === 0" class="text-center py-8 text-gray-400">
      <div class="i-carbon-empty-state text-3xl mx-auto mb-2" />
      <p>No commits yet</p>
    </div>

    <div v-else class="space-y-1">
      <div
        v-for="commit in commits"
        :key="commit.hash"
        class="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <code class="text-xs font-mono text-teal-600 mt-0.5 shrink-0">{{ commit.shortHash }}</code>
        <div class="min-w-0 flex-1">
          <p class="text-sm truncate">{{ commit.message }}</p>
          <p class="text-xs text-gray-400 mt-0.5">
            {{ commit.author }} · {{ formatDate(commit.date) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  catch {
    return dateStr
  }
}
</script>
