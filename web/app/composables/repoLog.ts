import type { CommitLogResponse } from '~/types'

/**
 * 仓库提交日志 composable
 */
export function useRepoLog(name: MaybeRef<string>, limit = 20) {
  const repoName = toRef(name)

  const { data, status, error, refresh } = useFetch<CommitLogResponse>(
    () => `/api/repos/${repoName.value}/log?limit=${limit}`,
    {
      key: `repo-log-${repoName.value}`,
      default: () => ({ repo: repoName.value, commits: [], total: 0 }),
      watch: [repoName],
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
