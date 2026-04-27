<script setup lang="ts">
interface LogEvent {
  type: string
  message: string
  createdAt: string
}

defineProps<{
  events: LogEvent[]
  isLive: boolean
}>()

const show = ref(false)
</script>

<template>
  <div v-if="events.length || isLive" class="log-panel">
    <button class="log-toggle" @click="show = !show">
      <div class="log-toggle-content">
        <span class="i-carbon-terminal" />
        <span class="log-toggle-title">Live Logs</span>
        <span v-if="isLive" class="live-indicator">● Live</span>
      </div>
      <span :class="show ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" />
    </button>

    <div v-if="show" class="log-content">
      <div v-if="!events.length" class="log-empty">
        Waiting for events...
      </div>
      <div v-else class="log-entries">
        <div
          v-for="(evt, idx) in events.slice().reverse()"
          :key="idx"
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
}

.log-toggle-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.live-indicator {
  font-size: var(--font-size-xs);
  color: var(--color-success);
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
