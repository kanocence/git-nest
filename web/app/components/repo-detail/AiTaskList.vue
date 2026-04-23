<script setup lang="ts">
import type { AiRunRecord, AiTaskSummary } from '~/types'

const props = defineProps<{
  tasks: AiTaskSummary[]
  repoRuns: AiRunRecord[]
  workspace: {
    occupiedByAi?: boolean
    clean?: boolean | null
    path?: string
    currentBranch?: string | null
  } | null
  canStart: boolean
  uploading: boolean
  uploadSuccess: string
  uploadError: string
  aiActionError: string
  aiStartingTaskPath: string | null
}>()

const emit = defineEmits<{
  upload: [file: File]
  startTask: [taskPath: string]
  deleteTask: [taskPath: string]
}>()

const taskFileInput = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  taskFileInput.value?.click()
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.[0])
    emit('upload', target.files[0])
  target.value = ''
}

function getTaskRuns(taskPath: string) {
  return props.repoRuns.filter(r => r.task_path === taskPath)
}

function getLatestTaskRun(taskPath: string) {
  const runs = getTaskRuns(taskPath)
  return runs.length ? runs[0] : null
}

function formatMs(ms: number) {
  const minutes = Math.round(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours > 0)
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  return `${minutes}m`
}
</script>

<template>
  <div class="task-section">
    <div class="task-header">
      <h2 class="section-title">
        <span class="i-carbon-machine-learning-model" />
        AI Tasks
      </h2>
      <div class="task-status">
        <span
          v-if="workspace?.occupiedByAi"
          class="status-badge status-badge--warning"
        >
          AI Occupied
        </span>
        <span v-else class="status-badge">Idle</span>
        <ActionButton
          label="Upload Task"
          icon="i-carbon-upload"
          variant="secondary"
          :loading="uploading"
          @click="triggerUpload"
        />
      </div>
    </div>

    <input
      ref="taskFileInput"
      type="file"
      accept=".yaml,.yml"
      class="file-input-hidden"
      @change="onFileSelected"
    >

    <div v-if="uploadSuccess" class="alert alert--success">
      {{ uploadSuccess }}
    </div>
    <div v-if="uploadError" class="alert alert--error">
      {{ uploadError }}
    </div>

    <div class="workspace-info">
      <div class="info-row">
        Shared workspace: <code>{{ workspace?.path || '/workspace' }}</code>
      </div>
      <div class="info-row">
        Current branch: <code>{{ workspace?.currentBranch || 'not ready' }}</code>
      </div>
      <div class="info-row">
        Workspace clean:
        <span v-if="workspace?.clean === true">yes</span>
        <span v-else-if="workspace?.clean === false">no</span>
        <span v-else>unknown</span>
      </div>
      <div v-if="!canStart" class="info-row info-row--warning">
        <span v-if="workspace?.occupiedByAi">Starting is disabled while another AI run is occupying this repository.</span>
        <span v-else-if="workspace?.clean === false">Starting is disabled until the shared workspace is clean.</span>
      </div>
      <div v-else-if="workspace?.clean === null" class="info-row info-row--info">
        Workspace will be prepared automatically when you start a task.
      </div>
      <div v-if="aiActionError" class="info-row info-row--error">
        {{ aiActionError }}
      </div>
    </div>

    <div v-if="tasks.length" class="task-list">
      <div
        v-for="task in tasks"
        :key="task.path"
        class="task-card"
      >
        <div class="task-card-header">
          <div class="task-title">
            {{ task.title }}
          </div>
          <div class="task-badges">
            <span v-if="!task.valid" class="badge badge--danger">Invalid YAML</span>
            <span v-if="task.requireApproval" class="badge badge--info">Approval Required</span>
            <span v-if="task.maxIterations" class="badge">Max {{ task.maxIterations }}</span>
            <span v-if="task.executor" class="badge badge--cyan">
              {{ task.executor.max_turns }} turns / {{ formatMs(task.executor.timeout) }}
            </span>
            <span v-if="task.executor?.max_continuations" class="badge badge--warning">
              {{ task.executor.max_continuations }} continuations
            </span>
            <span v-if="task.acceptance?.commands?.length" class="badge badge--purple">
              {{ task.acceptance.commands.length }} acceptance command{{ task.acceptance.commands.length > 1 ? 's' : '' }}
            </span>
          </div>
        </div>

        <div class="task-meta">
          <code>{{ task.path }}</code>
        </div>
        <div class="task-meta">
          Base branch: <code>{{ task.baseBranch || 'repo default' }}</code>
        </div>

        <div v-if="getLatestTaskRun(task.path)" class="task-meta">
          Last run:
          <NuxtLink
            :to="`/tasks/${getLatestTaskRun(task.path)!.id}`"
            class="run-link"
          >
            {{ getLatestTaskRun(task.path)!.status }}
          </NuxtLink>
        </div>

        <div v-if="task.nodeCount || task.edgeCount" class="task-meta">
          Nodes: {{ task.nodeCount }} · Edges: {{ task.edgeCount }}
        </div>

        <div v-if="task.roles.length" class="task-meta">
          Roles: {{ task.roles.join(', ') }}
        </div>

        <div v-if="task.valid" class="task-actions">
          <ActionButton
            label="Start Run"
            icon="i-carbon-play"
            :loading="aiStartingTaskPath === task.path"
            :disabled="!canStart || aiStartingTaskPath !== null"
            @click="emit('startTask', task.path)"
          />
          <ActionButton
            label="Delete"
            icon="i-carbon-trash-can"
            variant="danger"
            @click="emit('deleteTask', task.path)"
          />
        </div>

        <div v-if="task.parseError" class="task-error">
          {{ task.parseError }}
        </div>
      </div>
    </div>

    <div v-else class="task-empty">
      No task YAML files found under <code>.git-nest/tasks/</code>.
    </div>
  </div>
</template>

<style scoped>
.file-input-hidden {
  display: none;
}

.task-section {
  margin: var(--space-8) 0;
}

.task-header {
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

.task-status {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.status-badge {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
}

.status-badge--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.alert {
  padding: var(--space-3);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-3);
}

.alert--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.workspace-info {
  padding: var(--space-4);
  border-radius: var(--border-radius-lg);
  background-color: var(--bg-elevated);
  margin-bottom: var(--space-4);
}

.info-row {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row--warning {
  color: var(--color-warning);
}

.info-row--info {
  color: var(--color-primary);
}

.info-row--error {
  color: var(--color-danger);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.task-card {
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  background-color: var(--bg-surface);
}

.task-card-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.task-title {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.task-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.badge {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: 9999px;
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
}

.badge--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.badge--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.badge--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.badge--cyan {
  color: var(--color-cyan);
  background-color: var(--color-cyan-light);
}

.badge--purple {
  color: var(--color-purple);
  background-color: var(--color-purple-light);
}

.task-meta {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-2);
  word-break: break-all;
}

.run-link {
  color: var(--color-primary);
  text-decoration: none;
}

.run-link:hover {
  text-decoration: underline;
}

.task-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  align-items: center;
}

.task-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
  margin-top: var(--space-2);
}

.task-empty {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: var(--space-4);
  border-radius: var(--border-radius-lg);
  background-color: var(--bg-elevated);
}
</style>
