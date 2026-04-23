<script setup lang="ts">
interface Run {
  status: string
  task_branch?: string | null
}

const props = defineProps<{
  run: Run | null
  actionLoading: string | null
  deletingBranch: boolean
}>()

const emit = defineEmits<{
  action: [action: string]
  deleteBranch: []
}>()

const isWaitingApproval = computed(() => props.run?.status === 'waiting_approval')
const isWaitingContinuation = computed(() => props.run?.status === 'waiting_continuation')
const isSystemInterrupted = computed(() => props.run?.status === 'system_interrupted')
const isTerminal = computed(() => {
  if (!props.run)
    return false
  return ['completed', 'failed', 'cancelled'].includes(props.run.status)
})
const canDeleteTaskBranch = computed(() => Boolean(isTerminal.value && props.run?.task_branch?.startsWith('ai/')))
const canRelease = computed(() => ['running', 'queued', 'preparing', 'waiting_continuation'].includes(props.run?.status || ''))
</script>

<template>
  <div v-if="!isTerminal || canDeleteTaskBranch" class="actions-panel">
    <div class="actions-title">
      Actions
    </div>
    <div class="actions-list">
      <template v-if="isWaitingApproval">
        <ActionButton
          label="Approve"
          icon="i-carbon-checkmark"
          :loading="actionLoading === 'approve'"
          @click="emit('action', 'approve')"
        />
        <ActionButton
          label="Reject"
          icon="i-carbon-close"
          variant="danger"
          :loading="actionLoading === 'reject'"
          @click="emit('action', 'reject')"
        />
      </template>

      <template v-if="isWaitingContinuation">
        <ActionButton
          label="Continue"
          icon="i-carbon-play"
          :loading="actionLoading === 'continue'"
          @click="emit('action', 'continue')"
        />
        <ActionButton
          label="Stop"
          icon="i-carbon-stop"
          variant="danger"
          :loading="actionLoading === 'stop'"
          @click="emit('action', 'stop')"
        />
      </template>

      <ActionButton
        v-if="isSystemInterrupted"
        label="Retry"
        icon="i-carbon-reset"
        :loading="actionLoading === 'retry'"
        @click="emit('action', 'retry')"
      />

      <ActionButton
        v-if="canRelease"
        label="Release"
        icon="i-carbon-close"
        variant="danger"
        :loading="actionLoading === 'release'"
        @click="emit('action', 'release')"
      />

      <ActionButton
        v-if="canDeleteTaskBranch"
        label="Delete Task Branch"
        icon="i-carbon-trash-can"
        variant="danger"
        :loading="deletingBranch"
        @click="emit('deleteBranch')"
      />
    </div>
  </div>
</template>

<style scoped>
.actions-panel {
  margin-bottom: var(--space-6);
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
}

.actions-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-3);
}

.actions-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
