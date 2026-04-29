<script setup lang="ts">
import type { UiEvent } from '#shared/utils/ai-events'
import { shouldRefreshAiState, toUiEvent } from '#shared/utils/ai-events'
import AiTaskList from '~/components/repo-detail/AiTaskList.vue'
import CommitLogSection from '~/components/repo-detail/CommitLogSection.vue'
import LiveLogPanel from '~/components/repo-detail/LiveLogPanel.vue'
import RepoHeader from '~/components/repo-detail/RepoHeader.vue'
import RepoWorkspace from '~/components/repo-detail/RepoWorkspace.vue'

const route = useRoute('repos-name')
const name = computed(() => route.params.name as string)

useHead({ title: () => `${name.value} - Git Nest` })

definePageMeta({
  layout: 'default',
})

// Branch selection
interface Branch {
  name: string
}

const { data: branchData } = useFetch<{ branches: Branch[] }>(
  () => `/api/repos/${name.value}/branches`,
  {
    key: `branches-${name.value}`,
    default: () => ({ branches: [] }),
  },
)

const selectedBranch = ref<string | undefined>(undefined)

const { commits, loading: logLoading, error: logError, refresh: refreshLog } = useRepoLog(name, 20, selectedBranch)
const logErrorMessage = computed(() => {
  const error = logError.value
  if (!error)
    return null
  return error.data?.error || error.statusMessage || error.message || 'Failed to load commits'
})
const { deleteRepo, loading: deleting } = useRunner()

// Debounced refresh
const isRefreshingLog = ref(false)
const debouncedRefreshLog = useDebounceFn(async () => {
  if (isRefreshingLog.value)
    return
  isRefreshingLog.value = true
  try {
    await refreshLog()
  }
  finally {
    isRefreshingLog.value = false
  }
}, 300)

const { operations, currentOp, isRunning, execute } = useStreamOperation()
const router = useRouter()

usePushEvents({
  onPush: (event) => {
    if (event.repo === name.value)
      debouncedRefreshLog()
  },
})

const { data: workspace, refresh: refreshWorkspace } = useFetch<{ exists: boolean, path: string }>(
  () => `/api/repos/${name.value}/workspace`,
  { key: `workspace-${name.value}` },
)

// AI tasks composable
const {
  aiTasks,
  aiWorkspace,
  repoRuns,
  canStartAiTask,
  refreshAiTasks,
  refreshAiWorkspace,
  refreshAiRuns,
  aiActionError,
  aiStartingTaskPath,
  lastStartedRun,
  pendingStartTaskPath,
  showRestartConfirm,
  promptStartAiTask,
  doStartAiTask,
  uploading,
  uploadSuccess,
  uploadError,
  showCreateTaskDialog,
  creatingTask,
  createTaskError,
  handleTaskUpload,
  handleCreateTask,
  taskToDelete,
  showDeleteTaskConfirm,
  confirmDeleteTask,
  handleDeleteTask,
} = useAiRepoTasks(name, selectedBranch)

const isRefreshingAiTasks = ref(false)
const debouncedRefreshAiTasks = useDebounceFn(async () => {
  if (isRefreshingAiTasks.value)
    return
  isRefreshingAiTasks.value = true
  try {
    await refreshAiTasks()
  }
  finally {
    isRefreshingAiTasks.value = false
  }
}, 300)

watch(branchData, (data) => {
  const branches = data?.branches || []
  if (!branches.length)
    return
  const hasSelected = selectedBranch.value ? branches.some(b => b.name === selectedBranch.value) : false
  if (!hasSelected)
    selectedBranch.value = branches[0]?.name
}, { immediate: true })

watch(selectedBranch, async (branch) => {
  if (!branch)
    return
  await Promise.all([debouncedRefreshLog(), debouncedRefreshAiTasks()])
}, { immediate: true })

// Branch delete
const branchToDelete = ref<string | null>(null)
const showDeleteBranchConfirm = ref(false)
const deletingBranch = ref(false)
const branchDeleteError = ref('')

async function handleDeleteBranch() {
  if (!branchToDelete.value)
    return
  deletingBranch.value = true
  branchDeleteError.value = ''
  try {
    await $fetch(`/api/repos/${name.value}/branches/delete`, {
      method: 'POST',
      body: { branch: branchToDelete.value },
    })
    showDeleteBranchConfirm.value = false
    if (selectedBranch.value === branchToDelete.value)
      selectedBranch.value = undefined
    branchToDelete.value = null
    await refreshNuxtData(`branches-${name.value}`)
  }
  catch (error: any) {
    branchDeleteError.value = error?.data?.error || error?.statusMessage || 'Failed to delete branch'
  }
  finally {
    deletingBranch.value = false
  }
}

// Clone/Pull
async function handleClone() {
  await execute('clone', name.value)
  await refreshWorkspace()
  await refreshAiWorkspace()
  await debouncedRefreshAiTasks()
}

async function handlePull() {
  await execute('pull', name.value)
  await refreshLog()
  await refreshAiWorkspace()
  await debouncedRefreshAiTasks()
}

function handleDownloadZip() {
  const branch = selectedBranch.value || ''
  const url = branch
    ? `/api/repos/${name.value}/archive?branch=${encodeURIComponent(branch)}`
    : `/api/repos/${name.value}/archive`
  const a = document.createElement('a')
  a.href = url
  a.click()
}

// SSH URL
const { public: { serverHost, sshHost, sshGitPath, sshPort } } = useRuntimeConfig()
const sshUrl = computed(() => {
  const host = sshHost || serverHost || '<ssh-host>'
  const port = sshPort || 22
  const rawPath = sshGitPath?.replace(/^\.?\//, '') || 'data/git'
  return `ssh://git@${host}:${port}/${rawPath}/${name.value}.git`
})

// Editor URL
const { public: { codeServerUrl } } = useRuntimeConfig()
const editorUrl = computed(() => {
  if (!codeServerUrl || !workspace.value?.exists)
    return ''
  const base = codeServerUrl.replace(/\/$/, '')
  return `${base}/?folder=/workspace/${name.value}`
})

// SSE live logs
const liveEvents = ref<UiEvent[]>([])
const { data: sseData } = useEventSource('/api/ai/events')

watch(sseData, (newData) => {
  if (!newData)
    return
  try {
    const event = JSON.parse(newData)
    const runId = event.runId || event.run_id
    const isCurrentRepo = event.repo === name.value
    const isRelevant = isCurrentRepo || (runId && repoRuns.value.some(r => r.id === runId))
    if (!isRelevant)
      return

    const uiEvent = toUiEvent(event, true)
    liveEvents.value.push(uiEvent)
    if (liveEvents.value.length > 20)
      liveEvents.value = liveEvents.value.slice(-20)

    if (shouldRefreshAiState(uiEvent.type)) {
      refreshAiWorkspace()
      refreshAiRuns()
    }
  }
  catch {
    // ignore parse errors
  }
})

// Delete repo
const showDeleteConfirm = ref(false)

async function handleDelete() {
  try {
    await deleteRepo(name.value)
    showDeleteConfirm.value = false
    await router.push('/')
  }
  catch {
    // handled by useRunner
  }
}
</script>

<template>
  <div class="repo-detail">
    <RepoHeader
      :name="name"
      :branches="branchData?.branches?.map(b => b.name) || []"
      :selected-branch="selectedBranch"
      :ssh-url="sshUrl"
      @update:selected-branch="selectedBranch = $event"
      @delete-branch="branchToDelete = $event; showDeleteBranchConfirm = true"
    />

    <RepoWorkspace
      :exists="!!workspace?.exists"
      :is-running="isRunning"
      :editor-url="editorUrl"
      @clone="handleClone"
      @pull="handlePull"
      @download="handleDownloadZip"
    >
      <TerminalOutput :operation="currentOp" />
      <div class="mt-4">
        <OperationHistory :operations="operations.filter(op => op !== currentOp)" />
      </div>
    </RepoWorkspace>

    <AiTaskList
      :tasks="aiTasks?.tasks || []"
      :repo-runs="repoRuns"
      :workspace="aiWorkspace || null"
      :can-start="canStartAiTask"
      :branches="branchData?.branches?.map(b => b.name) || []"
      :selected-branch="selectedBranch"
      :uploading="uploading"
      :upload-success="uploadSuccess"
      :upload-error="uploadError"
      :show-create-task-dialog="showCreateTaskDialog"
      :creating-task="creatingTask"
      :create-task-error="createTaskError"
      :ai-action-error="aiActionError"
      :ai-starting-task-path="aiStartingTaskPath"
      @update:show-create-task-dialog="showCreateTaskDialog = $event"
      @upload="handleTaskUpload"
      @create-task="handleCreateTask"
      @start-task="promptStartAiTask"
      @delete-task="confirmDeleteTask"
    />

    <LiveLogPanel
      :events="liveEvents"
      :is-live="!!aiWorkspace?.occupiedByAi"
      :last-run="lastStartedRun || repoRuns[0] || null"
    />

    <CommitLogSection
      :loading="logLoading"
      :error="logErrorMessage"
      @refresh="debouncedRefreshLog()"
    >
      <CommitLog :commits="commits" :loading="logLoading" />
    </CommitLogSection>

    <!-- Danger Zone -->
    <div class="danger-zone">
      <h3 class="danger-title">
        Danger Zone
      </h3>
      <p class="danger-desc">
        Once you delete a repository, there is no going back. Please be certain.
      </p>
      <ActionButton
        label="Delete Repository"
        icon="i-carbon-trash-can"
        variant="danger"
        @click="showDeleteConfirm = true"
      />
    </div>

    <!-- Modals -->
    <ModalDialog v-model="showRestartConfirm" title="Start Task Again">
      <p>This task has been run before. Are you sure you want to start it again?</p>
      <template #actions>
        <ActionButton label="Start" icon="i-carbon-play" @click="doStartAiTask(pendingStartTaskPath!)" />
      </template>
    </ModalDialog>

    <ModalDialog v-model="showDeleteTaskConfirm" title="Delete Task">
      <p>Are you sure you want to delete <strong>{{ taskToDelete }}</strong>?</p>
      <p class="warning-text">
        This action cannot be undone.
      </p>
      <template #actions>
        <ActionButton label="Delete" icon="i-carbon-trash-can" variant="danger" @click="handleDeleteTask" />
      </template>
    </ModalDialog>

    <ModalDialog v-model="showDeleteBranchConfirm" title="Delete Branch">
      <p>Are you sure you want to delete branch <strong>{{ branchToDelete }}</strong>?</p>
      <p class="warning-text">
        This action cannot be undone.
      </p>
      <div v-if="branchDeleteError" class="error-text">
        {{ branchDeleteError }}
      </div>
      <template #actions>
        <ActionButton label="Delete" icon="i-carbon-trash-can" variant="danger" :loading="deletingBranch" @click="handleDeleteBranch" />
      </template>
    </ModalDialog>

    <ModalDialog v-model="showDeleteConfirm" title="Delete Repository">
      <p>Are you sure you want to delete <strong>{{ name }}</strong>?</p>
      <p class="warning-text">
        This action cannot be undone.
      </p>
      <template #actions>
        <ActionButton label="Delete" icon="i-carbon-trash-can" variant="danger" :loading="deleting" @click="handleDelete" />
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.repo-detail {
  max-width: 48rem;
  margin: 0 auto;
}

.mt-4 {
  margin-top: var(--space-4);
}

.danger-zone {
  margin-top: var(--space-10);
  padding: var(--space-4);
  border: 1px solid var(--color-danger-border-subtle);
  border-radius: var(--border-radius-lg);
}

.danger-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-danger);
  margin-bottom: var(--space-2);
}

.danger-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}

.warning-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin-top: var(--space-2);
}

.error-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin-top: var(--space-2);
}
</style>
