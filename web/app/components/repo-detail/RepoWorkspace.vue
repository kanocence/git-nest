<script setup lang="ts">
defineProps<{
  exists: boolean
  isRunning: boolean
  editorUrl: string
}>()

const emit = defineEmits<{
  clone: []
  pull: []
  download: []
}>()
</script>

<template>
  <div class="workspace-section">
    <div class="workspace-header">
      <h2 class="section-title">
        <Icon name="i-carbon-terminal" />
        Workspace
      </h2>
      <span
        v-if="exists"
        class="status-badge status-badge--success"
      >
        Cloned
      </span>
      <span v-else class="status-badge">
        Not cloned
      </span>
    </div>

    <div class="workspace-actions">
      <ActionButton
        v-if="!exists"
        label="Clone to Workspace"
        icon="i-carbon-download"
        :loading="isRunning"
        @click="emit('clone')"
      />
      <ActionButton
        v-if="exists"
        label="Pull"
        icon="i-carbon-cloud-download"
        :loading="isRunning"
        @click="emit('pull')"
      />
      <ActionButton
        label="Download ZIP"
        icon="i-carbon-document-download"
        variant="secondary"
        @click="emit('download')"
      />
      <a
        v-if="editorUrl"
        :href="editorUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="editor-link"
      >
        <Icon name="i-carbon-code" />
        Open in Editor
      </a>
    </div>

    <slot />
  </div>
</template>

<style scoped>
.workspace-section {
  margin-bottom: var(--space-6);
}

.workspace-header {
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

.status-badge {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
}

.status-badge--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.workspace-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.editor-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-inverse);
  background-color: var(--color-info);
  border-radius: var(--border-radius-md);
  text-decoration: none;
  transition: opacity var(--transition-fast);
}

.editor-link:hover {
  opacity: 0.9;
}
</style>
