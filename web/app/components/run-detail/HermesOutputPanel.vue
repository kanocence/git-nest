<script setup lang="ts">
import type { UiEvent } from '#shared/utils/ai-events'
import { getHermesOutputText, summarizeUiEvents } from '#shared/utils/ai-events'

const props = defineProps<{
  events: UiEvent[]
  isLive: boolean
}>()

const output = computed(() => getHermesOutputText(props.events))
const summary = computed(() => summarizeUiEvents(props.events))
const outputRef = ref<HTMLElement | null>(null)

watch(() => output.value.length, () => {
  nextTick(() => {
    if (outputRef.value)
      outputRef.value.scrollTop = outputRef.value.scrollHeight
  })
})
</script>

<template>
  <section class="output-panel">
    <div class="output-header">
      <div class="output-title-group">
        <h2 class="output-title">
          <span class="i-carbon-terminal" />
          Hermes Output
        </h2>
        <span v-if="isLive" class="live-badge">Live</span>
      </div>
      <div class="output-meta">
        <span>{{ summary.executorEventCount }} executor events</span>
        <span class="status-badge" :class="`status-badge--${summary.tone}`">
          {{ summary.status }}
        </span>
      </div>
    </div>

    <pre v-if="output" ref="outputRef" class="output-body">{{ output }}</pre>
    <div v-else class="output-empty">
      Waiting for Hermes output...
    </div>
  </section>
</template>

<style scoped>
.output-panel {
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  background-color: var(--bg-surface);
}

.output-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-color);
}

.output-title-group,
.output-meta {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.output-title {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.live-badge,
.status-badge {
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  font-size: var(--font-size-xs);
}

.live-badge {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.output-meta {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.status-badge {
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}

.status-badge--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.status-badge--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.status-badge--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.status-badge--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.output-body {
  max-height: 28rem;
  margin: 0;
  padding: var(--space-4);
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--font-size-xs);
  line-height: 1.55;
  color: var(--text-primary);
  background-color: var(--bg-elevated);
  white-space: pre-wrap;
  word-break: break-word;
}

.output-empty {
  padding: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
