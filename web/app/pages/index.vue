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
  if (!search.value.trim()) return repos.value
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
  <div class="max-w-3xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-700 flex items-center gap-2">
          <span class="i-carbon-repository text-teal-600" />
          Repositories
        </h1>
        <p class="text-sm text-gray-500 mt-1">
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
    <div v-if="repos.length > 0" class="mb-4">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 i-carbon-search text-gray-400" />
        <input
          v-model="search"
          type="text"
          placeholder="Filter repositories..."
          class="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100
                 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
                 placeholder-gray-400 text-sm"
        >
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 mb-4">
      <div class="flex items-center gap-2">
        <span class="i-carbon-warning" />
        <span>Failed to load repositories. Is git-runner running?</span>
      </div>
      <button class="text-sm underline mt-2" @click="refresh()">
        Retry
      </button>
    </div>

    <!-- Loading State -->
    <div v-else-if="loading" class="text-center py-16 text-gray-400">
      <span class="animate-pulse text-lg">Loading repositories...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="repos.length === 0" class="text-center py-16">
      <div class="i-carbon-folder text-5xl text-gray-300 mx-auto mb-4" />
      <p class="text-gray-500 mb-4">
        No repositories yet
      </p>
      <ActionButton
        label="Create your first repository"
        icon="i-carbon-add"
        @click="createDialog?.open()"
      />
    </div>

    <!-- Repo List -->
    <div v-else class="space-y-3">
      <div
        v-for="repo in filteredRepos"
        :key="repo.name"
        class="group relative"
      >
        <RepoCard :repo="repo" />
        <button
          class="absolute top-4 right-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity
                 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
          title="Delete repository"
          @click.prevent="confirmDelete(repo.name)"
        >
          <span class="i-carbon-trash-can text-sm" />
        </button>
      </div>

      <!-- No search results -->
      <div v-if="filteredRepos.length === 0 && search" class="text-center py-8 text-gray-400">
        <span class="i-carbon-search text-3xl mb-2 block mx-auto" />
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
      <p>
        Are you sure you want to delete <strong>{{ repoToDelete }}</strong>?
      </p>
      <p class="text-sm text-red-500 mt-2">
        This action cannot be undone. The bare repository and all its data will be permanently removed.
      </p>
      <p v-if="deleteError" class="text-sm text-red-500 mt-2">
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
