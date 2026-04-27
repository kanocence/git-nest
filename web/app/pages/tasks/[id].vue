<script setup lang="ts">
import CodeServerBanner from '~/components/run-detail/CodeServerBanner.vue'
import EventList from '~/components/run-detail/EventList.vue'
import RunActions from '~/components/run-detail/RunActions.vue'
import RunHeader from '~/components/run-detail/RunHeader.vue'
import RunInfoPanel from '~/components/run-detail/RunInfoPanel.vue'

definePageMeta({
  layout: 'default',
})

const route = useRoute('tasks-id')
const id = computed(() => route.params.id as string)

useHead({
  title: () => `AI Run ${id.value}`,
})

const {
  loading,
  error,
  run,
  events,
  refresh,
  actionLoading,
  actionError,
  actionSuccess,
  executeAction,
  showDeleteBranchConfirm,
  deletingBranch,
  deleteTaskBranch,
  codeServerEditorUrl,
} = useAiRunDetail(id)

const { liveEvents, isConnected } = useAiEvents({
  filter: (event) => {
    return event.runId === id.value || event.run_id === id.value || event.type === 'connected'
  },
})

const executorBudget = useExecutorBudget(events)
const allEvents = useMergedEvents(events, liveEvents)

watch(isConnected, (connected) => {
  if (!connected)
    refresh()
})
</script>

<template>
  <div class="run-detail">
    <RunHeader
      :id="id"
      :title="run?.task_title"
      :loading="loading"
      :is-sse-connected="isConnected"
      @refresh="refresh()"
    />

    <div v-if="error" class="alert alert--error">
      Failed to load AI run details.
    </div>

    <div v-else-if="loading && !run" class="loading-state">
      Loading AI run...
    </div>

    <template v-else-if="run">
      <!-- Action feedback -->
      <div v-if="actionError" class="alert alert--error">
        {{ actionError }}
      </div>
      <div v-if="actionSuccess" class="alert alert--success">
        {{ actionSuccess }}
      </div>

      <!-- Actions -->
      <RunActions
        :run="run"
        :action-loading="actionLoading"
        :deleting-branch="deletingBranch"
        @action="executeAction"
        @delete-branch="showDeleteBranchConfirm = true"
      />

      <!-- Code Server Banner -->
      <CodeServerBanner v-if="codeServerEditorUrl" :editor-url="codeServerEditorUrl" />

      <!-- Info Panel -->
      <RunInfoPanel :run="run" :executor-budget="executorBudget" />

      <!-- Last Error -->
      <div v-if="run.last_error" class="alert alert--error">
        {{ run.last_error }}
      </div>

      <!-- Events -->
      <EventList :events="allEvents" />

      <!-- Delete Branch Confirmation -->
      <ModalDialog v-model="showDeleteBranchConfirm" title="Delete Task Branch">
        <p>
          Are you sure you want to delete branch <strong>{{ run.task_branch }}</strong>?
        </p>
        <p class="warning-text">
          This action cannot be undone.
        </p>
        <template #actions>
          <ActionButton
            label="Delete"
            icon="i-carbon-trash-can"
            variant="danger"
            :loading="deletingBranch"
            @click="deleteTaskBranch"
          />
        </template>
      </ModalDialog>
    </template>
  </div>
</template>

<style scoped>
.run-detail {
  max-width: 64rem;
  margin: 0 auto;
}

.alert {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.alert--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.loading-state {
  text-align: center;
  padding: var(--space-16) 0;
  color: var(--text-muted);
  font-size: var(--font-size-lg);
}

.warning-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin-top: var(--space-2);
}
</style>
