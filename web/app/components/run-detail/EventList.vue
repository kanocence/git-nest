<script setup lang="ts">
import type { UiEvent } from '#shared/utils/ai-events'
import { summarizeUiEvents } from '#shared/utils/ai-events'
import EventItem from '~/components/run-detail/EventItem.vue'

const props = defineProps<{
  events: UiEvent[]
}>()

const containerRef = ref<HTMLElement | null>(null)
const summary = computed(() => summarizeUiEvents(props.events))

watch(() => props.events.length, () => {
  nextTick(() => {
    if (containerRef.value)
      containerRef.value.scrollTop = containerRef.value.scrollHeight
  })
})
</script>

<template>
  <div class="event-list">
    <div class="event-list-header">
      <h2 class="event-list-title">
        Events
      </h2>
      <span class="event-count">{{ events.length }} events</span>
    </div>
    <div v-if="events.length" class="event-summary">
      <div>
        <div class="summary-label">
          Status
        </div>
        <div class="summary-status" :class="`summary-status--${summary.tone}`">
          {{ summary.status }}
        </div>
      </div>
      <div class="summary-latest">
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
    <div v-if="events.length === 0" class="event-empty">
      No events recorded yet.
    </div>
    <div v-else ref="containerRef" class="event-items">
      <EventItem v-for="event in events" :key="event.key" :event="event" />
    </div>
  </div>
</template>

<style scoped>
.event-list {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}

.event-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-surface);
}

.event-list-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.event-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.event-summary {
  display: grid;
  grid-template-columns: minmax(7rem, auto) minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-elevated);
}

.summary-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.summary-status {
  display: inline-flex;
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background-color: var(--bg-surface);
}

.summary-status--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.summary-status--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.summary-status--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.summary-status--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.summary-latest {
  min-width: 0;
}

.summary-message {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-counts {
  display: flex;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.event-empty {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: var(--space-6);
}

.event-items {
  max-height: 24rem;
  overflow-y: auto;
}

@media (max-width: 760px) {
  .event-summary {
    grid-template-columns: 1fr;
  }

  .summary-counts {
    flex-wrap: wrap;
  }
}
</style>
