<script setup lang="ts">
const props = withDefaults(defineProps<{
  icon?: string
  label: string
  loading?: boolean
  variant?: 'primary' | 'danger' | 'secondary'
  disabled?: boolean
}>(), {
  variant: 'primary',
  icon: undefined,
})

defineEmits<{
  click: []
}>()

const variantClasses = computed(() => {
  if (props.disabled || props.loading) {
    return 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-50 text-white'
  }
  switch (props.variant) {
    case 'danger':
      return 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
    case 'secondary':
      return 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 cursor-pointer'
    default:
      return 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer'
  }
})
</script>

<template>
  <button
    class="text-sm font-500 px-3 py-1.5 rounded-md inline-flex gap-1.5 transition-colors items-center"
    :class="variantClasses"
    :disabled="disabled || loading"
    @click="$emit('click')"
  >
    <span v-if="loading" class="i-carbon-renew text-sm animate-spin" />
    <span v-else-if="icon" :class="icon" class="text-sm" />
    <span>{{ label }}</span>
  </button>
</template>
