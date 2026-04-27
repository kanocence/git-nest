<script setup lang="ts">
import { appName } from '~/constants'

definePageMeta({
  layout: 'default',
})

useHead({ title: appName })

const { repos, loading, error, refresh } = useRepos()
const createDialog = ref<{ open: () => void } | null>(null)

// 搜索/筛选
const search = ref('')
const filteredRepos = computed(() => {
  if (!search.value.trim())
    return repos.value
  const q = search.value.toLowerCase()
  return repos.value.filter(r =>
    r.name.toLowerCase().includes(q)
    || r.headBranch?.toLowerCase().includes(q),
  )
})

// 推送事件自动刷新
usePushEvents({
  onPush: () => refresh(),
})

// 删除相关
const { deleteRepo, loading: deleting, error: deleteError } = useRunner()
const showDeleteConfirm = ref(false)
const repoToDelete = ref('')

function confirmDelete(name: string) {
  repoToDelete.value = name
  showDeleteConfirm.value = true
}

async function handleDelete() {
  try {
    await deleteRepo(repoToDelete.value)
    showDeleteConfirm.value = false
    repoToDelete.value = ''
    await refresh()
  }
  catch {
    // error handled by useRunner
  }
}

async function onRepoCreated() {
  await refresh()
}
</script>

<template>
  <div class="repo-list-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="i-carbon-repository page-icon" />
          Repositories
        </h1>
        <p class="page-subtitle">
          {{ repos.length }} repositories
        </p>
      </div>
      <ActionButton
        label="New"
        icon="i-carbon-add"
        @click="createDialog?.open()"
      />
    </div>

    <!-- Search -->
    <div v-if="repos.length > 0" class="search-box">
      <div class="search-wrapper">
        <span class="i-carbon-search search-icon" />
        <input
          v-model="search"
          type="text"
          placeholder="Filter repositories..."
          class="search-input"
        >
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="alert alert--error">
      <div class="alert-content">
        <span class="i-carbon-warning" />
        <span>Failed to load repositories. Is git-runner running?</span>
      </div>
      <button class="retry-btn" @click="refresh()">
        Retry
      </button>
    </div>

    <!-- Loading State -->
    <div v-else-if="loading" class="loading-state">
      <span>Loading repositories...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="repos.length === 0" class="empty-state">
      <div class="i-carbon-folder empty-icon" />
      <p class="empty-text">
        No repositories yet
      </p>
      <ActionButton
        label="Create your first repository"
        icon="i-carbon-add"
        @click="createDialog?.open()"
      />
    </div>

    <!-- Repo List -->
    <div v-else class="repo-list">
      <div
        v-for="repo in filteredRepos"
        :key="repo.name"
        class="repo-item"
      >
        <RepoCard :repo="repo" />
        <button
          class="delete-btn"
          title="Delete repository"
          @click.prevent="confirmDelete(repo.name)"
        >
          <span class="i-carbon-trash-can" />
        </button>
      </div>

      <!-- No search results -->
      <div v-if="filteredRepos.length === 0 && search" class="search-empty">
        <span class="i-carbon-search search-empty-icon" />
        <p>No repositories match "{{ search }}"</p>
      </div>
    </div>

    <!-- Create Dialog -->
    <CreateRepoDialog
      ref="createDialog"
      @created="onRepoCreated"
    />

    <!-- Delete Confirmation Dialog -->
    <ModalDialog v-model="showDeleteConfirm" title="Delete Repository">
      <p>Are you sure you want to delete <strong>{{ repoToDelete }}</strong>?</p>
      <p class="warning-text">
        This action cannot be undone. The bare repository and all its data will be permanently removed.
      </p>
      <p v-if="deleteError" class="error-text">
        {{ deleteError }}
      </p>
      <template #actions>
        <ActionButton
          label="Delete"
          icon="i-carbon-trash-can"
          variant="danger"
          :loading="deleting"
          @click="handleDelete"
        />
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.repo-list-page {
  max-width: 48rem;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.page-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.page-icon {
  color: var(--color-primary);
}

.page-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

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
  padding: var(--space-2) var(--space-3);
  padding-left: var(--space-9);
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

.alert {
  padding: var(--space-4);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
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

.loading-state {
  text-align: center;
  padding: var(--space-16) 0;
  color: var(--text-muted);
  font-size: var(--font-size-lg);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.empty-state {
  text-align: center;
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

.repo-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.repo-item {
  position: relative;
}

.delete-btn {
  position: absolute;
  right: var(--space-4);
  top: var(--space-4);
  padding: var(--space-1);
  border-radius: var(--border-radius-sm);
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  opacity: 1;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast);
}

.delete-btn:hover {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

@media (min-width: 640px) {
  .delete-btn {
    opacity: 0;
  }

  .repo-item:hover .delete-btn {
    opacity: 1;
  }
}

.search-empty {
  text-align: center;
  padding: var(--space-8) 0;
  color: var(--text-muted);
}

.search-empty-icon {
  font-size: 2rem;
  display: block;
  margin: 0 auto var(--space-2);
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

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
