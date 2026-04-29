<script setup lang="ts">
const props = defineProps<{
  /** Display text or run-status string. When no `tone` is given, tone is derived from this. */
  status: string
  /** Explicit tone override. 'neutral' and omitted both fall back to deriving tone from `status`. */
  tone?: StatusTone | 'neutral'
}>()

const computedTone = computed<StatusTone>(() => {
  if (props.tone === 'neutral')
    return 'default'
  if (props.tone)
    return props.tone
  return getStatusTone(props.status)
})
</script>

<template>
  <span class="badge" :class="`badge--${computedTone}`">
    <slot>{{ status }}</slot>
  </span>
</template>

<style scoped>
.badge {
  display: inline-block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  white-space: nowrap;
}

.badge--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.badge--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.badge--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.badge--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.badge--default {
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}
</style>
