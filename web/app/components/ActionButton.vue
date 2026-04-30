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

const variantClass = computed(() => {
  if (props.disabled || props.loading)
    return 'btn--disabled'
  return `btn--${props.variant}`
})
</script>

<template>
  <button
    class="btn"
    :class="variantClass"
    :disabled="disabled || loading"
    @click="$emit('click')"
  >
    <Icon v-if="loading" name="i-carbon-renew" class="icon-spin" />
    <Icon v-else-if="icon" :name="icon" class="btn-icon" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--space-1);
  padding: 0 var(--space-3);
  height: 2rem;
  line-height: 1;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--border-radius-md);
  border: none;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.btn--primary {
  background-color: var(--color-primary);
  color: var(--text-inverse);
}

.btn--primary:hover {
  background-color: var(--color-primary-hover);
}

.btn--danger {
  background-color: var(--color-danger);
  color: var(--text-inverse);
}

.btn--danger:hover {
  background-color: var(--color-danger-hover);
}

.btn--secondary {
  background-color: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn--secondary:hover {
  background-color: var(--border-color);
}

.btn--disabled {
  background-color: var(--text-muted);
  color: var(--text-inverse);
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-icon {
  font-size: var(--font-size-sm);
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
