import type { AiRunListResponse, AiTaskListResponse, AiWorkspaceState } from '~/types'

/**
 * AI 任务列表与操作
 */
export function useAiRepoTasks(repoName: MaybeRef<string>, selectedBranch?: MaybeRef<string | undefined>) {
  const name = toRef(repoName)
  const branch = toRef(selectedBranch)

  // Tasks
  const { data: aiTasks, refresh: refreshAiTasks } = useFetch<AiTaskListResponse>(
    () => `/api/repos/${name.value}/ai/tasks?ref=${encodeURIComponent(branch.value || '')}`,
    {
      key: () => `ai-tasks-${name.value}-${branch.value || ''}`,
      default: () => ({ repo: name.value, ref: branch.value || '', tasks: [], total: 0 }),
      immediate: false,
    },
  )

  // Workspace
  const { data: aiWorkspace, refresh: refreshAiWorkspace } = useFetch<AiWorkspaceState>(
    () => `/api/repos/${name.value}/ai/workspace`,
    {
      key: () => `ai-workspace-${name.value}`,
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

  // Runs (for this repo)
  const { data: aiRuns, refresh: refreshAiRuns } = useFetch<AiRunListResponse>(
    '/api/ai/runs',
    { key: 'ai-runs-repo', default: () => ({ runs: [], total: 0 }) },
  )

  const repoRuns = computed(() => aiRuns.value?.runs.filter(r => r.repo === name.value) || [])
  const canStartAiTask = computed(() => aiWorkspace.value?.occupiedByAi !== true && aiWorkspace.value?.clean !== false)

  // Task start
  const aiActionError = ref('')
  const aiStartingTaskPath = ref<string | null>(null)
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
    pendingStartTaskPath.value = null
    handleStartAiTask(taskPath)
  }

  const router = useRouter()

  async function handleStartAiTask(taskPath: string) {
    aiActionError.value = ''
    aiStartingTaskPath.value = taskPath
    try {
      const response = await $fetch<{ run: { id: string } }>(`/api/repos/${name.value}/ai/tasks/start`, {
        method: 'POST',
        body: { taskPath, ref: branch.value || undefined },
      })
      await refreshAiWorkspace()
      await refreshAiTasks()
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

  // Task upload
  const uploading = ref(false)
  const uploadSuccess = ref('')
  const uploadError = ref('')

  async function handleTaskUpload(file: File) {
    uploading.value = true
    uploadError.value = ''
    uploadSuccess.value = ''
    try {
      const content = await file.text()
      const filePath = `.git-nest/tasks/${file.name}`
      await $fetch(`/api/repos/${name.value}/ai/tasks/upload`, {
        method: 'POST',
        body: { filePath, content, ref: branch.value || undefined },
      })
      uploadSuccess.value = `Uploaded ${file.name}`
      await refreshAiTasks()
    }
    catch (error: any) {
      uploadError.value = error?.data?.error || error?.statusMessage || 'Upload failed'
    }
    finally {
      uploading.value = false
    }
  }

  // Task delete
  const taskToDelete = ref<string | null>(null)
  const showDeleteTaskConfirm = ref(false)

  function confirmDeleteTask(taskPath: string) {
    taskToDelete.value = taskPath
    showDeleteTaskConfirm.value = true
  }

  async function handleDeleteTask() {
    if (!taskToDelete.value)
      return
    try {
      const query = new URLSearchParams({ filePath: taskToDelete.value })
      if (branch.value)
        query.set('ref', branch.value)
      await $fetch(`/api/repos/${name.value}/ai/tasks/delete?${query.toString()}`, { method: 'DELETE' })
      uploadSuccess.value = 'Task deleted'
      await refreshAiTasks()
    }
    catch (error: any) {
      uploadError.value = error?.data?.error || error?.statusMessage || 'Delete failed'
    }
    finally {
      showDeleteTaskConfirm.value = false
      taskToDelete.value = null
    }
  }

  return {
    aiTasks,
    aiWorkspace,
    repoRuns,
    canStartAiTask,
    refreshAiTasks,
    refreshAiWorkspace,
    refreshAiRuns,
    // Start
    aiActionError: readonly(aiActionError),
    aiStartingTaskPath: readonly(aiStartingTaskPath),
    pendingStartTaskPath,
    showRestartConfirm,
    promptStartAiTask,
    doStartAiTask,
    // Upload
    uploading: readonly(uploading),
    uploadSuccess: readonly(uploadSuccess),
    uploadError: readonly(uploadError),
    handleTaskUpload,
    // Delete
    taskToDelete,
    showDeleteTaskConfirm,
    confirmDeleteTask,
    handleDeleteTask,
  }
}
