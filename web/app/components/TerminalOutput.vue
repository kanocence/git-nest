<script setup lang="ts">
import type { OperationRecord } from '~/composables/streamOperation'

const props = defineProps<{
  operation: OperationRecord | null
}>()

const terminalRef = ref<HTMLElement | null>(null)

// 自动滚到底部
watch(
  () => props.operation?.lines.length,
  async () => {
    await nextTick()
    if (terminalRef.value) {
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    }
  },
)
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
  <div
    v-if="operation"
    class="border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700"
  >
    <!-- Header -->
    <div class="px-3 py-2 border-b border-gray-200 bg-gray-100 flex items-center justify-between dark:border-gray-700 dark:bg-gray-800">
      <div class="text-sm flex gap-2 items-center">
        <Icon
          v-if="operation.status === 'running'"
          name="i-carbon-renew"
          class="text-teal-500 animate-spin"
        />
        <Icon
          v-else-if="operation.status === 'success'"
          name="i-carbon-checkmark-filled"
          class="text-green-500"
        />
        <Icon
          v-else
          name="i-carbon-close-filled"
          class="text-red-500"
        />
        <span class="font-medium">{{ operation.type === 'import' ? 'Import' : operation.type === 'clone' ? 'Clone' : 'Pull' }}</span>
        <span class="text-gray-400">{{ operation.repo }}</span>
      </div>
      <span class="text-xs text-gray-400">
        {{ formatTime(operation.startedAt) }}
      </span>
    </div>

    <!-- Terminal body -->
    <div
      ref="terminalRef"
      class="text-xs text-gray-100 leading-5 font-mono p-3 bg-gray-900 max-h-80 overflow-y-auto"
    >
      <div v-if="operation.lines.length === 0 && operation.status === 'running'" class="text-gray-500 animate-pulse">
        Waiting for output...
      </div>
      <div
        v-for="(line, i) in operation.lines"
        :key="i"
        :class="{
          'text-red-400': line.startsWith('Error:') || line.startsWith('✗'),
          'text-green-400': line.startsWith('✓'),
          'text-gray-500': line.startsWith('$'),
        }"
      >
        {{ line }}
      </div>
    </div>
  </div>
</template>
