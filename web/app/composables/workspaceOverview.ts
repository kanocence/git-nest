import type { Ref } from 'vue'
import type { AiRunListResponse, AiRunRecord, RepoInfo } from '~/types'
import { formatTimeAgo } from '@vueuse/core'

export interface WorkspaceOverviewState {
  exists: boolean
  clean: boolean | null
  currentBranch: string | null
  occupiedByAi: boolean
}

export function useWorkspaceOverview(repos: Ref<RepoInfo[]>) {
  const expandedRepos = ref(new Set<string>())
  const repoBranches = ref<Record<string, string[]>>({})
  const branchesLoading = ref<Record<string, boolean>>({})
  const workspaceByRepo = ref<Record<string, WorkspaceOverviewState>>({})
  const workspaceLoading = ref<Record<string, boolean>>({})

  const activeStatuses = 'queued,preparing,running,waiting_approval,waiting_continuation'
  const { data: activeRunsData, refresh: refreshActiveRuns } = useFetch<AiRunListResponse>(
    `/api/ai/runs?limit=50&status=${activeStatuses}`,
    { key: 'home-active-runs', default: () => ({ runs: [], total: 0, limit: 50, offset: 0 }) },
  )

  const activeRunsByRepo = computed(() => {
    const map: Record<string, AiRunRecord> = {}
    for (const run of activeRunsData.value?.runs || []) {
      if (!map[run.repo])
        map[run.repo] = run
    }
    return map
  })

  async function toggleBranches(repoName: string) {
    if (expandedRepos.value.has(repoName)) {
      expandedRepos.value.delete(repoName)
      return
    }
    expandedRepos.value.add(repoName)
    if (!repoBranches.value[repoName]) {
      branchesLoading.value[repoName] = true
      try {
        const data = await $fetch<{ branches: { name: string }[] }>(`/api/repos/${repoName}/branches`)
        repoBranches.value[repoName] = data.branches.map(b => b.name)
      }
      catch {
        repoBranches.value[repoName] = []
      }
      finally {
        branchesLoading.value[repoName] = false
      }
    }
  }

  async function refreshWorkspaceStatuses(names = repos.value.map(repo => repo.name)) {
    for (const name of names)
      workspaceLoading.value[name] = true

    const results = await Promise.allSettled(
      names.map(name => $fetch<WorkspaceOverviewState>(`/api/repos/${name}/ai/workspace`).catch(() => null)),
    )
    for (let i = 0; i < names.length; i++) {
      const result = results[i]
      const workspace = result?.status === 'fulfilled' ? result.value : null
      if (workspace)
        workspaceByRepo.value[names[i]!] = workspace
      workspaceLoading.value[names[i]!] = false
    }
  }

  watch(
    () => repos.value.map(r => r.name),
    (names) => {
      if (names.length)
        refreshWorkspaceStatuses(names)
    },
    { immediate: true },
  )

  const now = useNow({ interval: 30_000 })
  const repoTimeAgo = computed(() => {
    const current = now.value
    const map: Record<string, string> = {}
    for (const repo of repos.value)
      map[repo.name] = formatTimeAgo(new Date(repo.lastModified), {}, current)
    return map
  })

  async function refreshOverview() {
    await Promise.all([refreshActiveRuns(), refreshWorkspaceStatuses()])
  }

  return {
    activeRunsByRepo,
    branchesLoading,
    expandedRepos,
    refreshActiveRuns,
    refreshOverview,
    refreshWorkspaceStatuses,
    repoBranches,
    repoTimeAgo,
    toggleBranches,
    workspaceByRepo,
    workspaceLoading,
  }
}
