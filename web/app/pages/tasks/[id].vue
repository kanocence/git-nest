<script setup lang="ts">
import CodeServerBanner from '~/components/run-detail/CodeServerBanner.vue'
import EventList from '~/components/run-detail/EventList.vue'
import HermesOutputPanel from '~/components/run-detail/HermesOutputPanel.vue'
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

    <div v-if="error" class="gn-alert gn-alert--error">
      Failed to load AI run details.
    </div>

    <div v-else-if="loading && !run" class="gn-loading-state">
      Loading AI run...
    </div>

    <template v-else-if="run">
      <!-- Action feedback -->
      <div v-if="actionError" class="gn-alert gn-alert--error">
        {{ actionError }}
      </div>
      <div v-if="actionSuccess" class="gn-alert gn-alert--success">
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
      <div v-if="run.last_error" class="gn-alert gn-alert--error">
        {{ run.last_error }}
      </div>

      <!-- Hermes Output -->
      <HermesOutputPanel :events="allEvents" :is-live="isConnected" />

      <!-- Events -->
      <EventList :events="allEvents" />

      <!-- Delete Branch Confirmation -->
      <ModalDialog v-model="showDeleteBranchConfirm" title="Delete Task Branch">
        <p>
          Are you sure you want to delete branch <strong>{{ run.task_branch }}</strong>?
        </p>
        <p class="gn-warning-text">
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
</style>
