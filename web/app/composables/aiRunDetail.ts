import type { AiRunDetailResponse } from '~/types'

/**
 * AI Run 详情页数据与操作
 */
export function useAiRunDetail(runId: MaybeRef<string>) {
  const id = toRef(runId)

  const { data, status, error, refresh } = useFetch<AiRunDetailResponse>(
    () => `/api/ai/runs/${id.value}`,
    {
      key: () => `ai-run-${id.value}`,
    },
  )

  const loading = computed(() => status.value === 'pending')
  const run = computed(() => data.value?.run || null)
  const events = computed(() => data.value?.events || [])

  // Actions
  const actionLoading = ref<string | null>(null)
  const actionError = ref('')
  const actionSuccess = ref('')

  async function executeAction(action: string) {
    actionLoading.value = action
    actionError.value = ''
    actionSuccess.value = ''

    try {
      await $fetch(`/api/ai/runs/${id.value}/${action}`, {
        method: 'POST',
      })
      actionSuccess.value = `${action} successful`
      await refresh()
    }
    catch (err: any) {
      actionError.value = err?.data?.error || err?.message || `${action} failed`
    }
    finally {
      actionLoading.value = null
    }
  }

  // Delete task branch
  const showDeleteBranchConfirm = ref(false)
  const deletingBranch = ref(false)

  async function deleteTaskBranch() {
    if (!run.value)
      return
    deletingBranch.value = true
    actionError.value = ''
    actionSuccess.value = ''
    try {
      await $fetch(`/api/repos/${run.value.repo}/branches/delete`, {
        method: 'POST',
        body: { branch: run.value.task_branch },
      })
      actionSuccess.value = 'Task branch deleted'
      showDeleteBranchConfirm.value = false
    }
    catch (err: any) {
      actionError.value = err?.data?.error || err?.message || 'Delete branch failed'
    }
    finally {
      deletingBranch.value = false
    }
  }

  // Code server URL
  const { public: { codeServerUrl } } = useRuntimeConfig()
  const codeServerEditorUrl = computed(() => {
    if (!codeServerUrl || !run.value?.workspace_path)
      return ''
    const base = codeServerUrl.replace(/\/$/, '')
    return `${base}/?folder=/workspace/${run.value.repo}`
  })

  return {
    loading,
    error,
    run,
    events,
    refresh,
    actionLoading: readonly(actionLoading),
    actionError: readonly(actionError),
    actionSuccess: readonly(actionSuccess),
    executeAction,
    showDeleteBranchConfirm,
    deletingBranch: readonly(deletingBranch),
    deleteTaskBranch,
    codeServerEditorUrl,
  }
}
