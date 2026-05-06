<script setup lang="ts">
import type { CommitInfo } from '~/types'

defineProps<{
  commits: CommitInfo[]
  loading?: boolean
}>()
</script>

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

<template>
  <div>
    <div v-if="loading" class="text-gray-400 py-8 text-center">
      <span class="animate-pulse">Loading commits...</span>
    </div>

    <div v-else-if="commits.length === 0" class="text-gray-400 py-8 text-center">
      <Icon name="i-carbon-empty-state" class="text-3xl mx-auto mb-2 block" />
      <p>No commits yet</p>
    </div>

    <div v-else class="max-h-96 overflow-auto space-y-1">
      <div
        v-for="commit in commits"
        :key="commit.hash"
        class="p-3 rounded-lg flex gap-3 transition-colors items-start hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <code class="text-xs text-teal-600 font-mono mt-0.5 shrink-0">{{ commit.shortHash }}</code>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">
            {{ commit.message }}
          </p>
          <p class="text-xs text-gray-400 mt-0.5">
            {{ commit.author }} · {{ formatDate(commit.date) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
