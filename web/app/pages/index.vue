<script setup lang="ts">
import { appName } from '~/constants'

definePageMeta({
  layout: 'default',
})

useHead({ title: appName })

const { repos, loading, error, refresh } = useRepos()
const createDialog = ref<{ open: () => void } | null>(null)
const search = ref('')

const {
  activeRunsByRepo,
  branchesLoading,
  expandedRepos,
  refreshOverview,
  refreshWorkspaceStatuses,
  repoBranches,
  repoTimeAgo,
  toggleBranches,
  workspaceByRepo,
  workspaceLoading,
} = useWorkspaceOverview(repos)

const { operations, currentOp, runningByRepo, execute } = useStreamOperation()
const displayedOperation = computed(() => currentOp.value || operations.value[0] || null)

const filteredRepos = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return repos.value
  return repos.value.filter(repo =>
    repo.name.toLowerCase().includes(q)
    || repo.headBranch?.toLowerCase().includes(q)
    || repoBranches.value[repo.name]?.some(branch => branch.toLowerCase().includes(q)),
  )
})

usePushEvents({
  onPush: async () => {
    await refresh()
    await refreshOverview()
  },
})

async function onRepoCreated() {
  await refresh()
  await refreshOverview()
}

async function handleClone(repo: string) {
  try {
    const op = await execute('clone', repo)
    if (op.status === 'success') {
      await refresh()
      await refreshWorkspaceStatuses([repo])
    }
  }
  catch {
    // network/abort errors are shown in TerminalOutput
  }
}

async function handlePull(repo: string) {
  try {
    const op = await execute('pull', repo)
    if (op.status === 'success') {
      await refresh()
      await refreshWorkspaceStatuses([repo])
    }
  }
  catch {
    // network/abort errors are shown in TerminalOutput
  }
}
</script>

<template>
  <div class="workspace-page">
    <div class="gn-page-header">
      <div>
        <h1 class="gn-page-title">
          <Icon name="i-carbon-workspace" class="gn-page-icon" />
          Workspace Overview
        </h1>
        <p class="gn-page-subtitle">
          {{ repos.length }} {{ repos.length === 1 ? 'repository' : 'repositories' }}
        </p>
      </div>
      <ActionButton
        label="New Repository"
        icon="i-carbon-add"
        @click="createDialog?.open()"
      />
    </div>

    <div v-if="repos.length > 0" class="search-box">
      <div class="search-wrapper">
        <Icon name="i-carbon-search" class="search-icon" />
        <input
          v-model="search"
          type="text"
          placeholder="Filter by repo, branch, or workspace..."
          class="search-input"
        >
      </div>
    </div>

    <div v-if="error" class="gn-alert gn-alert--error">
      <div class="alert-content">
        <Icon name="i-carbon-warning" />
        <span>Failed to load repositories. Is git-runner running?</span>
      </div>
      <button class="retry-btn" @click="refresh()">
        Retry
      </button>
    </div>

    <div v-else-if="loading" class="gn-loading-state">
      <span>Loading repositories...</span>
    </div>

    <div v-else-if="repos.length === 0" class="empty-state">
      <Icon name="i-carbon-repo" class="empty-icon block" />
      <p class="empty-text">
        No repositories yet
      </p>
      <ActionButton
        label="Create your first repository"
        icon="i-carbon-add"
        @click="createDialog?.open()"
      />
    </div>

    <template v-else>
      <div class="workspace-list">
        <WorkspaceRepoBlock
          v-for="repo in filteredRepos"
          :key="repo.name"
          :repo="repo"
          :active-run="activeRunsByRepo[repo.name]"
          :workspace="workspaceByRepo[repo.name]"
          :workspace-loading="workspaceLoading[repo.name]"
          :branches="repoBranches[repo.name]"
          :branches-loading="branchesLoading[repo.name]"
          :expanded="expandedRepos.has(repo.name)"
          :time-ago="repoTimeAgo[repo.name]"
          :is-running="runningByRepo[repo.name]"
          @toggle-branches="toggleBranches"
          @clone="handleClone"
          @pull="handlePull"
        />

        <div v-if="filteredRepos.length === 0 && search" class="search-empty">
          <Icon name="i-carbon-search" class="search-empty-icon block" />
          <p>No repositories match "{{ search }}"</p>
        </div>
      </div>

      <TerminalOutput :operation="displayedOperation" />
      <OperationHistory :operations="operations.filter(op => op !== displayedOperation)" />
    </template>

    <CreateRepoDialog ref="createDialog" @created="onRepoCreated" />
  </div>
</template>

<style scoped>
.workspace-page {
  max-width: 52rem;
  margin: 0 auto;
}

.gn-page-header,
.search-box {
  margin-bottom: var(--space-4);
}

.search-wrapper {
  position: relative;
}

.search-icon {
  position: absolute;
  left: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  height: 2rem;
  padding: 0 var(--space-3) 0 var(--space-9);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.search-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.alert-content {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.retry-btn {
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}

.empty-state,
.search-empty {
  text-align: center;
  color: var(--text-muted);
}

.empty-state {
  padding: var(--space-16) 0;
}

.empty-icon {
  font-size: 3rem;
  color: var(--text-muted);
  margin: 0 auto var(--space-4);
}

.empty-text {
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.search-empty {
  padding: var(--space-8) 0;
}

.search-empty-icon {
  font-size: 2rem;
  margin: 0 auto var(--space-2);
}
</style>
