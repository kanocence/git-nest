<script setup lang="ts">
interface ExecutorBudget {
  maxTurns: number | null
  timeoutMs: number | null
  continuationsUsed: number | null
  maxContinuations: number | null
}

interface Run {
  repo: string
  status: string
  task_path?: string | null
  task_branch?: string | null
  workspace_path?: string | null
  created_at: string
  updated_at: string
  max_iterations?: number | null
  current_iteration?: number | null
}

defineProps<{
  run: Run
  executorBudget: ExecutorBudget
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

function formatDuration(createdAt: string, updatedAt: string) {
  const diff = new Date(updatedAt).getTime() - new Date(createdAt).getTime()
  if (diff < 0)
    return ''
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0)
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0)
    return `${hours}h ${minutes % 60}m`
  if (minutes > 0)
    return `${minutes}m`
  return `${Math.floor(diff / 1000)}s`
}

function formatDurationMs(ms: number) {
  const minutes = Math.round(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0)
    return `${days}d ${hours % 24}h`
  if (hours > 0)
    return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function getStatusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'status--success'
    case 'failed':
    case 'system_interrupted':
      return 'status--danger'
    case 'waiting_approval':
    case 'waiting_continuation':
      return 'status--warning'
    case 'running':
    case 'queued':
    case 'preparing':
      return 'status--info'
    case 'cancelled':
    default:
      return 'status--default'
  }
}
</script>

<template>
  <div class="info-grid">
    <div class="info-card">
      <InfoField label="Repo">
        <NuxtLink :to="`/repos/${run.repo}`" class="info-link">
          {{ run.repo }}
        </NuxtLink>
      </InfoField>
      <InfoField label="Status">
        <span class="status-badge" :class="getStatusClass(run.status)">
          {{ run.status }}
        </span>
      </InfoField>
      <InfoField label="Task File">
        <code class="info-code">{{ run.task_path || '-' }}</code>
      </InfoField>
    </div>

    <div class="info-card">
      <InfoField label="Branch">
        <code class="info-code">{{ run.task_branch || '-' }}</code>
      </InfoField>
      <InfoField label="Workspace">
        <code class="info-code">{{ run.workspace_path || '-' }}</code>
      </InfoField>
      <InfoField label="Created">
        {{ formatDate(run.created_at) }}
      </InfoField>
      <InfoField label="Duration">
        {{ formatDuration(run.created_at, run.updated_at) || '-' }}
      </InfoField>
      <InfoField v-if="executorBudget.maxTurns || executorBudget.timeoutMs" label="Executor Budget">
        <span v-if="executorBudget.maxTurns">{{ executorBudget.maxTurns }} turns</span>
        <span v-if="executorBudget.maxTurns && executorBudget.timeoutMs"> / </span>
        <span v-if="executorBudget.timeoutMs">{{ formatDurationMs(executorBudget.timeoutMs) }}</span>
      </InfoField>
      <InfoField v-if="executorBudget.maxContinuations != null" label="Continuations">
        {{ executorBudget.continuationsUsed || 0 }} / {{ executorBudget.maxContinuations }}
      </InfoField>
      <InfoField v-if="run.max_iterations != null" label="Iteration">
        {{ run.current_iteration || 0 }} / {{ run.max_iterations }}
      </InfoField>
    </div>
  </div>
</template>

<style scoped>
.info-grid {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

@media (min-width: 768px) {
  .info-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.info-card {
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  background-color: var(--bg-surface);
}

.info-link {
  color: var(--color-primary);
  text-decoration: none;
  transition: text-decoration var(--transition-fast);
}

.info-link:hover {
  text-decoration: underline;
}

.info-code {
  font-size: var(--font-size-sm);
  word-break: break-all;
  display: block;
  color: var(--text-secondary);
}

.status-badge {
  display: inline-block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
}

.status--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.status--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.status--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.status--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.status--default {
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}
</style>
