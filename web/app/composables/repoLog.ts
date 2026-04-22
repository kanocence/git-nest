import type { CommitLogResponse } from '~/types'

/**
 * 仓库提交日志 composable
 * @param name 仓库名称
 * @param limit 返回数量限制
 * @param branch 可选的分支名称，不传则返回默认分支日志
 */
export function useRepoLog(name: MaybeRef<string>, limit = 20, branch?: MaybeRef<string | undefined>) {
  const repoName = toRef(name)
  const branchRef = toRef(branch)

  const { data, status, error, refresh } = useFetch<CommitLogResponse>(
    () => {
      const baseUrl = `/api/repos/${repoName.value}/log?limit=${limit}`
      const branchParam = branchRef.value ? `&branch=${encodeURIComponent(branchRef.value)}` : ''
      return `${baseUrl}${branchParam}`
    },
    {
      key: computed(() => {
        const branchPart = branchRef.value ? `-${branchRef.value}` : ''
        return `repo-log-${repoName.value}${branchPart}`
      }),
      lazy: true,
      watch: [repoName, branchRef],
      immediate: false,
    },
  )

  const commits = computed(() => data.value?.commits || [])
  const loading = computed(() => status.value === 'pending')

  return {
    commits,
    loading,
    error,
    refresh,
  }
}
