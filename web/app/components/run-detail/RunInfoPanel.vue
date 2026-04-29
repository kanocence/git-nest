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
        <StatusBadge :status="run.status" />
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
        {{ formatDateTime(run.created_at) }}
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
</style>
