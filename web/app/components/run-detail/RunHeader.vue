<script setup lang="ts">
defineProps<{
  id: string
  title?: string | null
  loading: boolean
  isSseConnected: boolean
}>()

defineEmits<{
  refresh: []
}>()
</script>

<template>
  <div class="run-header">
    <div>
      <NuxtLink to="/tasks" class="back-link">
        <Icon name="i-carbon-arrow-left" />
        Back to AI Tasks
      </NuxtLink>
      <h1 class="run-title">
        {{ title || id }}
      </h1>
      <p class="run-id">
        Run ID: <code>{{ id }}</code>
      </p>
    </div>
    <div class="run-actions">
      <span v-if="isSseConnected" class="sse-badge">
        ● Live
      </span>
      <ActionButton
        label="Refresh"
        icon="i-carbon-renew"
        variant="secondary"
        :loading="loading"
        @click="$emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped>
.run-header {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.back-link:hover {
  color: var(--color-primary);
}

.run-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-top: var(--space-2);
}

.run-id {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.run-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.sse-badge {
  font-size: var(--font-size-xs);
  color: var(--color-success);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  background-color: var(--color-success-light);
}
</style>
