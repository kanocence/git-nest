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

const props = defineProps<{
  events: UiEvent[]
}>()

const containerRef = ref<HTMLElement | null>(null)

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

.event-empty {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: var(--space-6);
}

.event-items {
  max-height: 24rem;
  overflow-y: auto;
}
</style>
