<script setup lang="ts">
defineProps<{
  branches: string[]
  modelValue: string | undefined
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const open = ref(false)
const containerRef = ref<HTMLElement | null>(null)

function select(branch: string) {
  emit('update:modelValue', branch)
  open.value = false
}

function toggle() {
  open.value = !open.value
}

onClickOutside(containerRef, () => {
  open.value = false
})
</script>

<template>
  <div ref="containerRef" class="relative">
    <button
      type="button"
      class="text-sm px-3 py-1.5 border border-gray-300 rounded-md bg-white inline-flex gap-2 transition-colors items-center dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
      @click="toggle"
    >
      <span class="i-carbon-branch" />
      <span>{{ modelValue || 'Select branch' }}</span>
      <span
        class="text-xs transition-transform"
        :class="open ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
      />
    </button>

    <div
      v-if="open"
      class="mt-1 border border-gray-200 rounded-md bg-white max-h-60 min-w-full shadow-lg absolute z-10 overflow-auto dark:border-gray-700 dark:bg-gray-800"
    >
      <div
        v-for="branch in branches"
        :key="branch"
        class="text-sm px-3 py-2 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        :class="branch === modelValue ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300' : 'text-gray-700 dark:text-gray-300'"
        @click="select(branch)"
      >
        {{ branch }}
      </div>
    </div>
  </div>
</template>
