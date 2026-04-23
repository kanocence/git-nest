<script setup lang="ts">
import type { AiRunListResponse, AiTaskListResponse, AiWorkspaceState } from '~/types'

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

const { data: aiTasks, refresh: refreshAiTasks } = useFetch<AiTaskListResponse>(
  () => `/api/repos/${name.value}/ai/tasks?ref=${encodeURIComponent(selectedBranch.value || '')}`,
  {
    key: () => `ai-tasks-${name.value}-${selectedBranch.value || ''}`,
    default: () => ({ repo: name.value, ref: selectedBranch.value || '', tasks: [], total: 0 }),
    immediate: false,
  },
)

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

const { data: aiWorkspace, refresh: refreshAiWorkspace } = useFetch<AiWorkspaceState>(
  () => `/api/repos/${name.value}/ai/workspace`,
  {
    key: `ai-workspace-${name.value}`,
    default: () => ({
      repo: name.value,
      path: '',
      exists: false,
      isGitRepo: false,
      clean: null,
      currentBranch: null,
      currentCommit: null,
      occupiedByAi: false,
      activeRunId: null,
      activeTaskBranch: null,
      lockStatus: null,
      lockUpdatedAt: null,
    }),
  },
)

const { data: aiRuns, refresh: refreshAiRuns } = useFetch<AiRunListResponse>(
  '/api/ai/runs',
  { key: 'ai-runs-repo', default: () => ({ runs: [], total: 0 }) },
)

const repoRuns = computed(() => aiRuns.value?.runs.filter(r => r.repo === name.value) || [])

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
  await debouncedRefreshLog()
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

// AI Task actions
const aiActionError = ref('')
const aiStartingTaskPath = ref<string | null>(null)
const canStartAiTask = computed(() => aiWorkspace.value?.occupiedByAi !== true && aiWorkspace.value?.clean !== false)

const pendingStartTaskPath = ref<string | null>(null)
const showRestartConfirm = ref(false)

function promptStartAiTask(taskPath: string) {
  const hasHistory = repoRuns.value.filter(r => r.task_path === taskPath).some(r => r.status !== 'cancelled')
  if (hasHistory) {
    pendingStartTaskPath.value = taskPath
    showRestartConfirm.value = true
  }
  else {
    doStartAiTask(taskPath)
  }
}

function doStartAiTask(taskPath: string) {
  showRestartConfirm.value = false
  handleStartAiTask(taskPath)
}

async function handleStartAiTask(taskPath: string) {
  aiActionError.value = ''
  aiStartingTaskPath.value = taskPath
  try {
    const response = await $fetch<{ run: { id: string } }>(`/api/repos/${name.value}/ai/tasks/start`, {
      method: 'POST',
      body: { taskPath, ref: selectedBranch.value || undefined },
    })
    await refreshAiWorkspace()
    await debouncedRefreshAiTasks()
    await router.push(`/tasks/${response.run.id}`)
  }
  catch (error: any) {
    aiActionError.value = error?.data?.error || error?.statusMessage || 'Failed to start AI task.'
    await refreshAiWorkspace()
  }
  finally {
    aiStartingTaskPath.value = null
  }
}

// Task upload/delete
const uploading = ref(false)
const uploadSuccess = ref('')
const uploadError = ref('')
const taskToDelete = ref<string | null>(null)
const showDeleteTaskConfirm = ref(false)

async function handleTaskUpload(file: File) {
  uploading.value = true
  uploadError.value = ''
  uploadSuccess.value = ''
  try {
    const content = await file.text()
    const filePath = `.git-nest/tasks/${file.name}`
    await $fetch(`/api/repos/${name.value}/ai/tasks/upload`, {
      method: 'POST',
      body: { filePath, content, ref: selectedBranch.value || undefined },
    })
    uploadSuccess.value = `Uploaded ${file.name}`
    await debouncedRefreshAiTasks()
  }
  catch (error: any) {
    uploadError.value = error?.data?.error || error?.statusMessage || 'Upload failed'
  }
  finally {
    uploading.value = false
  }
}

function confirmDeleteTask(taskPath: string) {
  taskToDelete.value = taskPath
  showDeleteTaskConfirm.value = true
}

async function handleDeleteTask() {
  if (!taskToDelete.value)
    return
  try {
    const query = new URLSearchParams({ filePath: taskToDelete.value })
    if (selectedBranch.value)
      query.set('ref', selectedBranch.value)
    await $fetch(`/api/repos/${name.value}/ai/tasks/delete?${query.toString()}`, { method: 'DELETE' })
    uploadSuccess.value = 'Task deleted'
    await debouncedRefreshAiTasks()
  }
  catch (error: any) {
    uploadError.value = error?.data?.error || error?.statusMessage || 'Delete failed'
  }
  finally {
    showDeleteTaskConfirm.value = false
    taskToDelete.value = null
  }
}

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

// SSE live logs
const liveEvents = ref<Array<{ type: string, message: string, createdAt: string }>>([])
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

    const type = event.type || 'unknown'
    let message = event.message
    if (!message) {
      if (type === 'run.executor_log')
        message = event.log || '[executor log]'
      else if (type === 'run.queued')
        message = 'Run queued'
      else if (type === 'run.started')
        message = 'Run started'
      else if (type === 'run.completed')
        message = 'Run completed'
      else if (type === 'run.failed')
        message = `Run failed: ${event.error || ''}`
      else if (type === 'run.released')
        message = 'Run released'
      else if (type === 'connected')
        message = 'Connected to event stream'
      else if (type === 'run.waiting_approval')
        message = 'Run waiting for approval'
      else if (type === 'run.waiting_continuation')
        message = 'Run waiting for continuation'
      else message = JSON.stringify(event.payload ?? event)
    }

    liveEvents.value.push({ type, message, createdAt: new Date().toISOString() })
    if (liveEvents.value.length > 20)
      liveEvents.value = liveEvents.value.slice(-20)

    if (['run.completed', 'run.failed', 'run.cancelled', 'run.released', 'run.waiting_approval', 'run.waiting_continuation'].includes(type)) {
      refreshAiWorkspace()
      refreshAiRuns()
    }
  }
  catch {
    // ignore parse errors
  }
})
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
      :uploading="uploading"
      :upload-success="uploadSuccess"
      :upload-error="uploadError"
      :ai-action-error="aiActionError"
      :ai-starting-task-path="aiStartingTaskPath"
      @upload="handleTaskUpload"
      @start-task="promptStartAiTask"
      @delete-task="confirmDeleteTask"
    />

    <LiveLogPanel
      :events="liveEvents"
      :is-live="!!aiWorkspace?.occupiedByAi"
    />

    <CommitLogSection
      :loading="logLoading"
      :error="logError"
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
