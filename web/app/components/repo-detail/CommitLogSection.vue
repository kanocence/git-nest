<script setup lang="ts">
defineProps<{
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <div class="commit-section">
    <div class="commit-header">
      <h2 class="section-title">
        <Icon name="i-carbon-commit" />
        Recent Commits
      </h2>
      <ActionButton
        label="Refresh"
        icon="i-carbon-renew"
        variant="secondary"
        :loading="loading"
        @click="emit('refresh')"
      />
    </div>

    <div v-if="error" class="alert alert--error">
      <Icon name="i-carbon-warning" />
      Failed to load commits
      <button class="retry-btn" @click="emit('refresh')">
        Retry
      </button>
    </div>

    <div v-else class="commit-log-wrapper">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.commit-section {
  margin-top: var(--space-8);
}

.commit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.alert {
  padding: var(--space-4);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.retry-btn {
  margin-left: var(--space-2);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}

.commit-log-wrapper {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}
</style>
