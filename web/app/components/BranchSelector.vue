<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'

const props = defineProps<{
  branches?: string[]
  options?: Array<{ value: string, label: string }>
  modelValue: string | undefined
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const items = computed(() => {
  if (props.options)
    return props.options
  return (props.branches || []).map(b => ({ value: b, label: b }))
})

const displayLabel = computed(() => {
  const item = items.value.find(i => i.value === props.modelValue)
  return item?.label || props.modelValue || 'Select'
})

function select(value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="selector-trigger" type="button">
      <span class="i-carbon-branch" />
      <span class="selector-label">{{ displayLabel }}</span>
      <span class="i-carbon-chevron-down selector-chevron" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent class="selector-content" :side-offset="4">
        <DropdownMenuItem
          v-for="item in items"
          :key="item.value"
          class="selector-item"
          :class="{ 'selector-item--active': item.value === modelValue }"
          @select="select(item.value)"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.selector-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  background-color: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.selector-trigger:hover {
  background-color: var(--bg-elevated);
}

.selector-trigger:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.selector-label {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selector-chevron {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

:global(.selector-content) {
  min-width: 12rem;
  max-height: 15rem;
  padding: var(--space-1);
  overflow: auto;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-xl);
  z-index: var(--z-dropdown);
  animation: slideDown 100ms ease;
}

:global(.selector-item) {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast);
  outline: none;
}

:global(.selector-item:hover),
:global(.selector-item[data-highlighted]) {
  background-color: var(--bg-elevated);
}

:global(.selector-item--active) {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

:global(.selector-item--active[data-highlighted]) {
  background-color: var(--color-primary-light);
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
