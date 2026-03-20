<script setup lang="ts">
import type { OperationRecord } from '~/composables/streamOperation'

defineProps<{
  operations: OperationRecord[]
}>()
</script>

<script lang="ts">
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<template>
  <div v-if="operations.length > 0" class="space-y-2">
    <h3 class="text-sm text-gray-500 font-600 flex gap-1 items-center">
      <span class="i-carbon-recently-viewed" />
      Operation History
    </h3>

    <div
      v-for="op in operations"
      :key="op.id"
      class="text-sm p-2 rounded-md bg-gray-50 flex gap-2 items-center dark:bg-gray-800/50"
    >
      <span
        v-if="op.status === 'running'"
        class="i-carbon-renew text-teal-500 shrink-0 animate-spin"
      />
      <span
        v-else-if="op.status === 'success'"
        class="i-carbon-checkmark text-green-500 shrink-0"
      />
      <span
        v-else
        class="i-carbon-close text-red-500 shrink-0"
      />

      <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
        {{ op.type }}
      </span>

      <span class="text-gray-600 truncate dark:text-gray-400">
        {{ op.repo }}
      </span>

      <span class="text-xs text-gray-400 ml-auto shrink-0">
        {{ formatTime(op.startedAt) }}
      </span>
    </div>
  </div>
</template>
