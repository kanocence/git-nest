<script setup lang="ts">
const route = useRoute('repos-name')
const name = computed(() => route.params.name as string)

useHead({ title: () => `${name.value} — Git Nest` })

definePageMeta({
  layout: 'default',
})

const { commits, loading: logLoading, error: logError, refresh: refreshLog } = useRepoLog(name)
const { deleteRepo, loading: deleting } = useRunner()
const { operations, currentOp, isRunning, execute } = useStreamOperation()
const router = useRouter()

// 推送事件自动刷新提交日志
usePushEvents({
  onPush: (event) => {
    if (event.repo === name.value) {
      refreshLog()
    }
  },
})

// Workspace 状态
const { data: workspace, refresh: refreshWorkspace } = useFetch<{ exists: boolean, path: string }>(
  () => `/api/repos/${name.value}/workspace`,
  { key: `workspace-${name.value}` },
)

// 删除确认
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

// Clone/Pull 操作
async function handleClone() {
  await execute('clone', name.value)
  await refreshWorkspace()
}

async function handlePull() {
  await execute('pull', name.value)
  await refreshLog()
}

// SSH clone URL (dynamic from config)
const { public: { nasHost } } = useRuntimeConfig()
const sshUrl = computed(() => `git@${nasHost || '<nas-host>'}:/data/git/${name.value}.git`)
const copied = ref(false)

// code-server 编辑器链接
const { public: { codeServerUrl } } = useRuntimeConfig()
const editorUrl = computed(() => {
  if (!codeServerUrl || !workspace.value?.exists)
    return ''
  // code-server workspace 路径: /workspace/<repo-name>
  const base = codeServerUrl.replace(/\/$/, '')
  return `${base}/?folder=/workspace/${name.value}`
})

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(sshUrl.value)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  }
  catch {
    // clipboard API not available
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- Back + Header -->
    <div class="mb-6">
      <NuxtLink to="/" class="text-sm text-gray-500 mb-3 inline-flex gap-1 items-center hover:text-teal-600">
        <span class="i-carbon-arrow-left" />
        Repositories
      </NuxtLink>

      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-700 flex gap-2 items-center">
          <span class="i-carbon-repository text-teal-600" />
          {{ name }}
        </h1>
        <ActionButton
          label="Delete"
          icon="i-carbon-trash-can"
          variant="danger"
          @click="showDeleteConfirm = true"
        />
      </div>
    </div>

    <!-- SSH Clone URL -->
    <div class="mb-6 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <label class="text-xs text-gray-500 mb-1 block">SSH Clone URL</label>
      <div class="flex gap-2 items-center">
        <code class="text-sm text-gray-700 font-mono flex-1 break-all dark:text-gray-300">
          {{ sshUrl }}
        </code>
        <button
          class="p-1.5 rounded shrink-0 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
          :title="copied ? 'Copied!' : 'Copy'"
          @click="copyUrl"
        >
          <span :class="copied ? 'i-carbon-checkmark text-green-500' : 'i-carbon-copy'" class="text-sm" />
        </button>
      </div>
    </div>

    <!-- Workspace Operations -->
    <div class="mb-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-600 flex gap-2 items-center">
          <span class="i-carbon-terminal" />
          Workspace
        </h2>
        <div class="flex gap-2 items-center">
          <span
            v-if="workspace?.exists"
            class="text-xs text-green-600 px-2 py-0.5 rounded-full bg-green-100 dark:text-green-400 dark:bg-green-900/30"
          >
            Cloned
          </span>
          <span
            v-else
            class="text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
          >
            Not cloned
          </span>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <ActionButton
          v-if="!workspace?.exists"
          label="Clone to Workspace"
          icon="i-carbon-download"
          :loading="isRunning"
          @click="handleClone"
        />
        <ActionButton
          v-if="workspace?.exists"
          label="Pull"
          icon="i-carbon-cloud-download"
          :loading="isRunning"
          @click="handlePull"
        />
        <a
          v-if="editorUrl"
          :href="editorUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-white font-500 px-3 py-1.5 rounded-md bg-blue-600 inline-flex gap-1.5 cursor-pointer transition-colors items-center hover:bg-blue-700"
        >
          <span class="i-carbon-code text-sm" />
          <span>Open in Editor</span>
        </a>
      </div>

      <!-- Terminal Output -->
      <TerminalOutput :operation="currentOp" />

      <!-- Operation History -->
      <div class="mt-4">
        <OperationHistory :operations="operations.filter(op => op !== currentOp)" />
      </div>
    </div>

    <!-- Commit Log -->
    <div>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-600 flex gap-2 items-center">
          <span class="i-carbon-commit" />
          Recent Commits
        </h2>
        <ActionButton
          label="Refresh"
          icon="i-carbon-renew"
          variant="secondary"
          :loading="logLoading"
          @click="refreshLog()"
        />
      </div>

      <div v-if="logError" class="text-red-600 p-4 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
        <span class="i-carbon-warning mr-1" />
        Failed to load commits
        <button class="text-sm ml-2 underline" @click="refreshLog()">
          Retry
        </button>
      </div>

      <div v-else class="border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700">
        <CommitLog :commits="commits" :loading="logLoading" />
      </div>
    </div>

    <!-- Delete Confirmation -->
    <ModalDialog v-model="showDeleteConfirm" title="Delete Repository">
      <p>
        Are you sure you want to delete <strong>{{ name }}</strong>?
      </p>
      <p class="text-sm text-red-500 mt-2">
        This action cannot be undone.
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
