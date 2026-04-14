<script setup lang="ts">
import type { AiTaskListResponse, AiWorkspaceState } from '~/types'

const route = useRoute('repos-name')
const name = computed(() => route.params.name as string)

useHead({ title: () => `${name.value} - Git Nest` })

definePageMeta({
  layout: 'default',
})

// 分支选择 - 本地维护状态，无持久化
interface Branch {
  name: string
}

const { data: branchData } = useFetch<{ branches: Branch[] }>(
  () => `/api/repos/${name.value}/branches`,
  {
    key: `branches-${name.value}`,
    default: () => ({ branches: [] }),
  },
)

// 当前选中的分支（本地状态）
const selectedBranch = ref<string | undefined>(undefined)

watch(branchData, (data) => {
  if (data?.branches?.length && !selectedBranch.value) {
    selectedBranch.value = data.branches[0]?.name
  }
}, { immediate: true })

const { commits, loading: logLoading, error: logError, refresh: refreshLog } = useRepoLog(name, 20, selectedBranch)
const { deleteRepo, loading: deleting } = useRunner()
const { operations, currentOp, isRunning, execute } = useStreamOperation()
const router = useRouter()

usePushEvents({
  onPush: (event) => {
    if (event.repo === name.value) {
      refreshLog()
    }
  },
})

const { data: workspace, refresh: refreshWorkspace } = useFetch<{ exists: boolean, path: string }>(
  () => `/api/repos/${name.value}/workspace`,
  { key: `workspace-${name.value}` },
)

const { data: aiTasks, refresh: refreshAiTasks } = useFetch<AiTaskListResponse>(
  () => `/api/repos/${name.value}/ai/tasks?ref=${encodeURIComponent(selectedBranch.value || '')}`,
  {
    key: () => `ai-tasks-${name.value}-${selectedBranch.value || ''}`,
    default: () => ({ repo: name.value, ref: selectedBranch.value || '', tasks: [], total: 0 }),
  },
)

const { data: aiWorkspace, refresh: refreshAiWorkspace } = useFetch<AiWorkspaceState>(
  () => `/api/repos/${name.value}/ai/workspace`,
  {
    key: `ai-workspace-${name.value}`,
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

const aiActionError = ref('')
const aiStartingTaskPath = ref<string | null>(null)
const canStartAiTask = computed(() => aiWorkspace.value?.occupiedByAi !== true && aiWorkspace.value?.clean !== false)

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
  await refreshAiWorkspace()
  await refreshAiTasks()
}

async function handlePull() {
  await execute('pull', name.value)
  await refreshLog()
  await refreshAiWorkspace()
  await refreshAiTasks()
}

async function handleStartAiTask(taskPath: string) {
  aiActionError.value = ''
  aiStartingTaskPath.value = taskPath

  try {
    const response = await $fetch<{ run: { id: string } }>(`/api/repos/${name.value}/ai/tasks/start`, {
      method: 'POST',
      body: {
        taskPath,
        ref: selectedBranch.value || undefined,
      },
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

function handleDownloadZip() {
  const branch = selectedBranch.value || ''
  const url = branch
    ? `/api/repos/${name.value}/archive?branch=${encodeURIComponent(branch)}`
    : `/api/repos/${name.value}/archive`
  const a = document.createElement('a')
  a.href = url
  a.click()
}

// SSH clone URL (dynamic from config)
const { public: { serverHost, sshHost, sshGitPath, sshPort } } = useRuntimeConfig()
const sshUrl = computed(() => {
  const host = sshHost || serverHost || '<ssh-host>'
  const port = sshPort || 22
  // 移除开头可能的 ./，避免双斜杠
  const rawPath = sshGitPath?.replace(/^\.?\//, '') || 'data/git'
  return `ssh://git@${host}:${port}/${rawPath}/${name.value}.git`
})
const copied = ref(false)

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
        <div class="flex flex-wrap gap-2 items-center">
          <h1 class="text-2xl font-700 flex gap-2 items-center">
            <span class="i-carbon-repository text-teal-600" />
            {{ name }}
          </h1>
          <select
            v-if="branchData?.branches?.length"
            v-model="selectedBranch"
            class="text-sm px-2 py-1 border border-gray-300 rounded bg-white dark:border-gray-600 dark:bg-gray-800"
          >
            <option
              v-for="branch in branchData.branches"
              :key="branch.name"
              :value="branch.name"
            >
              {{ branch.name }}
            </option>
          </select>
        </div>
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
      <div class="text-xs text-gray-500 mt-2 space-y-1">
        <div>
          <span class="text-gray-400">Clone:</span>
          <code class="text-gray-600 ml-1 dark:text-gray-400">git clone {{ sshUrl }}</code>
        </div>
        <div>
          <span class="text-gray-400">Or existing repo:</span>
          <code class="text-gray-600 ml-1 dark:text-gray-400">git remote add git-nest {{ sshUrl }}</code>
        </div>
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
        <ActionButton
          label="Download ZIP"
          icon="i-carbon-document-download"
          @click="handleDownloadZip"
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

    <!-- AI Tasks -->
    <div class="my-8">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-600 flex gap-2 items-center">
          <span class="i-carbon-machine-learning-model" />
          AI Tasks
        </h2>
        <div class="flex gap-2 items-center">
          <span
            v-if="aiWorkspace?.occupiedByAi"
            class="text-xs text-amber-700 px-2 py-0.5 rounded-full bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30"
          >
            AI Occupied
          </span>
          <span
            v-else
            class="text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
          >
            Idle
          </span>
        </div>
      </div>

      <div class="mb-4 p-4 rounded-lg bg-gray-50 space-y-2 dark:bg-gray-800/50">
        <div class="text-sm text-gray-600 dark:text-gray-300">
          Shared workspace: <code>{{ aiWorkspace?.path || `/workspace/${name}` }}</code>
        </div>
        <div class="text-sm text-gray-600 dark:text-gray-300">
          Current branch:
          <code>{{ aiWorkspace?.currentBranch || 'not ready' }}</code>
        </div>
        <div class="text-sm text-gray-600 dark:text-gray-300">
          Workspace clean:
          <span v-if="aiWorkspace?.clean === true">yes</span>
          <span v-else-if="aiWorkspace?.clean === false">no</span>
          <span v-else>unknown</span>
        </div>
        <div v-if="aiWorkspace?.occupiedByAi" class="text-sm text-amber-700 dark:text-amber-300">
          Active run: <code>{{ aiWorkspace.activeRunId }}</code>
          <span v-if="aiWorkspace.activeTaskBranch">
            on <code>{{ aiWorkspace.activeTaskBranch }}</code>
          </span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">
          Goose runs valid tasks in the workspace. Web approval, retry, and release controls are available in the task detail page.
        </div>
        <div v-if="!canStartAiTask" class="text-xs text-amber-700 dark:text-amber-300">
          <span v-if="aiWorkspace?.occupiedByAi">Starting is disabled while another AI run is occupying this repository.</span>
          <span v-else-if="aiWorkspace?.clean === false">Starting is disabled until the shared workspace is clean.</span>
        </div>
        <div v-else-if="aiWorkspace?.clean === null" class="text-xs text-teal-700 dark:text-teal-300">
          Workspace will be prepared automatically when you start a task.
        </div>
        <div v-if="aiActionError" class="text-xs text-red-600 dark:text-red-400">
          {{ aiActionError }}
        </div>
      </div>

      <div v-if="aiTasks?.tasks?.length" class="space-y-3">
        <div
          v-for="task in aiTasks.tasks"
          :key="task.path"
          class="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
        >
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="font-600">
              {{ task.title }}
            </div>
            <div class="flex gap-2 items-center">
              <span
                v-if="!task.valid"
                class="text-xs text-red-700 px-2 py-0.5 rounded-full bg-red-100 dark:text-red-300 dark:bg-red-900/30"
              >
                Invalid YAML
              </span>
              <span
                v-if="task.hasHumanApproval"
                class="text-xs text-blue-700 px-2 py-0.5 rounded-full bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30"
              >
                Human Approval
              </span>
              <span
                v-if="task.maxIterations"
                class="text-xs text-gray-600 px-2 py-0.5 rounded-full bg-gray-100 dark:text-gray-300 dark:bg-gray-800"
              >
                Max {{ task.maxIterations }}
              </span>
            </div>
          </div>
          <div class="text-sm text-gray-500 mt-2 break-all">
            <code>{{ task.path }}</code>
          </div>
          <div class="text-sm text-gray-600 mt-2 dark:text-gray-300">
            Base branch: <code>{{ task.baseBranch || 'repo default' }}</code>
          </div>
          <div class="text-xs text-gray-500 mt-2 dark:text-gray-400">
            Nodes: {{ task.nodeCount }} · Edges: {{ task.edgeCount }}
          </div>
          <div v-if="task.roles.length" class="text-xs text-gray-500 mt-2 dark:text-gray-400">
            Roles: {{ task.roles.join(', ') }}
          </div>
          <div v-if="task.valid" class="mt-3">
            <ActionButton
              label="Start Run"
              icon="i-carbon-play"
              :loading="aiStartingTaskPath === task.path"
              :disabled="!canStartAiTask || aiStartingTaskPath !== null"
              @click="handleStartAiTask(task.path)"
            />
          </div>
          <div v-if="task.parseError" class="text-xs text-red-600 mt-2 dark:text-red-400">
            {{ task.parseError }}
          </div>
        </div>
      </div>

      <div v-else class="text-sm text-gray-500 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        No task YAML files found under <code>.git-nest/tasks/</code>.
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
