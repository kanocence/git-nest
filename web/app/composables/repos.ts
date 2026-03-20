import type { RepoListResponse } from '~/types'

/**
 * 仓库列表 composable
 * 提供仓库列表的获取、刷新和缓存
 */
export function useRepos() {
  const { data, status, error, refresh } = useFetch<RepoListResponse>('/api/repos', {
    key: 'repos',
    default: () => ({ repos: [], total: 0 }),
  })

  const repos = computed(() => data.value?.repos || [])
  const total = computed(() => data.value?.total || 0)
  const loading = computed(() => status.value === 'pending')

  return {
    repos,
    total,
    loading,
    error,
    refresh,
  }
}
