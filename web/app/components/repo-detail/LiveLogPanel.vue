<script setup lang="ts">
import type { UiEvent } from '#shared/utils/ai-events'
import type { AiRunRecord } from '~/types'
import { summarizeUiEvents } from '#shared/utils/ai-events'

const props = defineProps<{
  events: UiEvent[]
  isLive: boolean
  lastRun: AiRunRecord | null
}>()

const show = ref(false)
const summary = computed(() => summarizeUiEvents(props.events))
const recentEvents = computed(() => props.events.slice().reverse())
const hasPanelContent = computed(() => props.events.length > 0 || props.isLive || Boolean(props.lastRun))
const panelStatus = computed(() => props.events.length ? summary.value.status : formatRunStatus(props.lastRun?.status))
const panelTone = computed(() => props.events.length ? summary.value.tone : getRunTone(props.lastRun?.status))
const panelMessage = computed(() => props.events.length ? summary.value.latestMessage : getRunMessage(props.lastRun))

watch(() => [props.isLive, props.events.length] as const, ([isLive, eventCount]) => {
  if (isLive || eventCount > 0)
    show.value = true
}, { immediate: true })

function formatRunStatus(status?: string) {
  if (!status)
    return 'Idle'
  return status.replace(/_/g, ' ')
}

function getRunTone(status?: string) {
  if (status === 'completed')
    return 'success'
  if (status === 'failed' || status === 'system_interrupted')
    return 'danger'
  if (status === 'waiting_approval' || status === 'waiting_continuation')
    return 'warning'
  if (status === 'running' || status === 'queued' || status === 'preparing')
    return 'info'
  return 'neutral'
}

function getRunMessage(run: AiRunRecord | null) {
  if (!run)
    return 'Waiting for events'
  if (run.last_error)
    return run.last_error
  return `${run.task_title || run.task_path} is ${formatRunStatus(run.status)}`
}
</script>

<template>
  <div v-if="hasPanelContent" class="log-panel">
    <button class="log-toggle" @click="show = !show">
      <div class="log-toggle-content">
        <span class="i-carbon-terminal" />
        <span class="log-toggle-title">Live Logs</span>
        <span v-if="isLive" class="live-indicator">● Live</span>
        <span class="summary-badge" :class="`summary-badge--${panelTone}`">
          {{ panelStatus }}
        </span>
      </div>
      <div class="log-toggle-meta">
        <span class="event-total">{{ summary.total }} events</span>
        <span :class="show ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" />
      </div>
    </button>

    <div v-if="show" class="log-content">
      <div v-if="!events.length && !lastRun" class="log-empty">
        Waiting for events...
      </div>
      <div v-else>
        <div class="log-summary">
          <div class="summary-main">
            <div class="summary-label">
              Latest
            </div>
            <div class="summary-message">
              {{ panelMessage }}
            </div>
          </div>
          <div class="summary-side">
            <div class="summary-counts">
              <span>executor {{ summary.executorEventCount }}</span>
              <span>acceptance {{ summary.acceptanceEventCount }}</span>
            </div>
            <NuxtLink
              v-if="lastRun"
              :to="{ name: 'tasks-id', params: { id: lastRun.id } }"
              class="run-detail-link"
            >
              <span class="i-carbon-arrow-right" />
              Open details
            </NuxtLink>
          </div>
        </div>
        <div v-if="events.length" class="log-entries">
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

.summary-main {
  min-width: 0;
}

.summary-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.summary-message {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-side {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-end;
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

.run-detail-link {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  text-decoration: none;
}

.run-detail-link:hover {
  text-decoration: underline;
}

@media (max-width: 760px) {
  .log-summary {
    flex-direction: column;
  }

  .summary-side {
    align-items: flex-start;
  }

  .summary-message {
    white-space: normal;
  }
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
