<script setup lang="ts">
interface UiEvent {
  key: string
  type: string
  message: string
  nodeId?: string
  role?: string
  payload: any
  createdAt: string
  isLive: boolean
}

defineProps<{
  event: UiEvent
}>()

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<template>
  <div class="event-item" :class="{ 'event-item--live': event.isLive }">
    <div class="event-header">
      <div class="event-message">
        {{ event.message }}
      </div>
      <div class="event-time">
        {{ formatDate(event.createdAt) }}
      </div>
    </div>
    <div class="event-meta">
      <span>{{ event.type }}</span>
      <span v-if="event.nodeId"> · node <code>{{ event.nodeId }}</code></span>
      <span v-if="event.role"> · {{ event.role }}</span>
    </div>
    <pre v-if="event.payload" class="event-payload">{{ JSON.stringify(event.payload, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.event-item {
  padding: var(--space-4);
  transition: background-color var(--transition-fast);
  border-bottom: 1px solid var(--border-color);
}

.event-item:last-child {
  border-bottom: none;
}

.event-item--live {
  background-color: var(--color-info-bg-subtle);
}

.event-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.event-message {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.event-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.event-meta {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-top: var(--space-2);
}

.event-meta code {
  font-size: var(--font-size-xs);
}

.event-payload {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-top: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--border-radius-md);
  background-color: var(--bg-elevated);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
