<script setup lang="ts">
import type { UiEvent } from '#shared/utils/ai-events'
import { summarizeUiEvents } from '#shared/utils/ai-events'

const props = defineProps<{
  events: UiEvent[]
  isLive: boolean
}>()

const show = ref(false)
const summary = computed(() => summarizeUiEvents(props.events))
const recentEvents = computed(() => props.events.slice().reverse())
</script>

<template>
  <div v-if="events.length || isLive" class="log-panel">
    <button class="log-toggle" @click="show = !show">
      <div class="log-toggle-content">
        <span class="i-carbon-terminal" />
        <span class="log-toggle-title">Live Logs</span>
        <span v-if="isLive" class="live-indicator">● Live</span>
        <span v-if="events.length" class="summary-badge" :class="`summary-badge--${summary.tone}`">
          {{ summary.status }}
        </span>
      </div>
      <div class="log-toggle-meta">
        <span v-if="events.length" class="event-total">{{ summary.total }} events</span>
        <span :class="show ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" />
      </div>
    </button>

    <div v-if="show" class="log-content">
      <div v-if="!events.length" class="log-empty">
        Waiting for events...
      </div>
      <div v-else>
        <div class="log-summary">
          <div>
            <div class="summary-label">
              Latest
            </div>
            <div class="summary-message">
              {{ summary.latestMessage }}
            </div>
          </div>
          <div class="summary-counts">
            <span>executor {{ summary.executorEventCount }}</span>
            <span>acceptance {{ summary.acceptanceEventCount }}</span>
          </div>
        </div>
        <div class="log-entries">
          <div
            v-for="evt in recentEvents"
            :key="evt.key"
            class="log-entry"
          >
            <div class="log-time">
              {{ new Date(evt.createdAt).toLocaleTimeString('zh-CN') }}
            </div>
            <div class="log-message">
              {{ evt.message }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-panel {
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}

.log-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
}

.log-toggle:hover {
  background-color: var(--bg-elevated);
}

.log-toggle-content {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.log-toggle-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.live-indicator {
  font-size: var(--font-size-xs);
  color: var(--color-success);
}

.summary-badge {
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  font-size: var(--font-size-xs);
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
}

.summary-badge--success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.summary-badge--info {
  background-color: var(--color-info-light);
  color: var(--color-info);
}

.summary-badge--warning {
  background-color: var(--color-warning-light);
  color: var(--color-warning);
}

.summary-badge--danger {
  background-color: var(--color-danger-light);
  color: var(--color-danger);
}

.log-toggle-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
}

.event-total {
  font-size: var(--font-size-xs);
}

.log-content {
  border-top: 1px solid var(--border-color);
  max-height: 15rem;
  overflow-y: auto;
}

.log-empty {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: var(--space-4);
}

.log-entries {
  display: flex;
  flex-direction: column;
}

.log-summary {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}

.summary-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.summary-message {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.summary-counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-end;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.log-entry {
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-color);
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.log-message {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}
</style>
