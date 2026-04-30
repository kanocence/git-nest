<script setup lang="ts">
import { inferRepoNameFromRemoteUrl } from '~/utils/repo-url'

const emit = defineEmits<{
  created: [name: string]
}>()

type Mode = 'init' | 'clone'

const visible = ref(false)
const mode = ref<Mode>('init')
const repoName = ref('')
const remoteUrl = ref('')
const { createRepo, loading, error } = useRunner()
const { operations, isRepoRunning, execute } = useStreamOperation()
const nameEdited = ref(false)
const lastInferredName = ref('')
const submittedRepoName = ref<string | null>(null)
const repoRunning = computed(() => repoName.value ? isRepoRunning(repoName.value) : false)
// Use submittedRepoName once submission starts to prevent flickering when user edits the name field
const displayedOp = computed(() => {
  const target = submittedRepoName.value ?? (mode.value === 'clone' ? repoName.value : null)
  if (!target)
    return null
  return operations.value.find(op => op.repo === target && op.type === 'import') || null
})

const nameError = computed(() => {
  if (!repoName.value)
    return ''
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(repoName.value)) {
    return 'Only lowercase letters, digits, "_", ".", "-" allowed (start with letter or digit)'
  }
  if (repoName.value.length > 64) {
    return 'Name too long (max 64 characters)'
  }
  return ''
})

const remoteUrlError = computed(() => {
  if (mode.value !== 'clone' || !remoteUrl.value)
    return ''
  const v = remoteUrl.value.trim()
  const ok = /^(?:https?|git|ssh):\/\/[^\s'";&|<>`\\]+$/i.test(v)
    || /^[\w.-]+@[\w.-]+:[\w/.-]+$/.test(v)
  return ok ? '' : 'Enter a valid HTTPS, SSH, or git:// URL'
})

const canSubmit = computed(() => {
  if (loading.value || repoRunning.value || !repoName.value || nameError.value)
    return false
  if (mode.value === 'clone' && (!remoteUrl.value.trim() || remoteUrlError.value))
    return false
  return true
})

watch(remoteUrl, (value) => {
  if (mode.value !== 'clone')
    return
  const inferred = inferRepoNameFromRemoteUrl(value)
  if (!inferred)
    return
  if (!nameEdited.value || repoName.value === lastInferredName.value) {
    repoName.value = inferred
    lastInferredName.value = inferred
    nameEdited.value = false
  }
})

watch(mode, () => {
  error.value = null
  if (mode.value === 'clone') {
    const inferred = inferRepoNameFromRemoteUrl(remoteUrl.value)
    if (inferred && !repoName.value) {
      repoName.value = inferred
      lastInferredName.value = inferred
    }
  }
})

async function handleCreate() {
  if (!canSubmit.value)
    return
  try {
    if (mode.value === 'clone') {
      submittedRepoName.value = repoName.value
      const op = await execute('import', repoName.value, { remoteUrl: remoteUrl.value.trim() })
      if (op.status !== 'success') {
        error.value = 'Repository import failed'
        return
      }
    }
    else {
      await createRepo(repoName.value)
    }
    emit('created', repoName.value)
    visible.value = false
    reset()
  }
  catch {
    // error is already set in useRunner
  }
}

function reset() {
  repoName.value = ''
  remoteUrl.value = ''
  nameEdited.value = false
  lastInferredName.value = ''
  submittedRepoName.value = null
  error.value = null
}

function open() {
  visible.value = true
  mode.value = 'init'
  reset()
}

defineExpose({ open })
</script>

<template>
  <ModalDialog v-model="visible" title="Add Repository">
    <!-- Mode toggle -->
    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ 'mode-tab--active': mode === 'init' }"
        type="button"
        @click="mode = 'init'"
      >
        <Icon name="i-carbon-add" />
        New repository
      </button>
      <button
        class="mode-tab"
        :class="{ 'mode-tab--active': mode === 'clone' }"
        type="button"
        @click="mode = 'clone'"
      >
        <Icon name="i-carbon-download" />
        Clone from URL
      </button>
    </div>

    <div class="creator-form">
      <!-- Remote URL field (clone mode only) -->
      <div v-if="mode === 'clone'" class="field">
        <label class="field-label" for="remote-url">Remote URL</label>
        <input
          id="remote-url"
          v-model="remoteUrl"
          type="text"
          placeholder="https://github.com/user/repo.git"
          autocomplete="off"
          class="text-input"
          @keydown.enter="handleCreate"
        >
        <p v-if="remoteUrlError" class="error-text">
          {{ remoteUrlError }}
        </p>
      </div>

      <!-- Repo name field -->
      <div class="field">
        <label class="field-label" for="repo-name">Repository Name</label>
        <input
          id="repo-name"
          v-model="repoName"
          type="text"
          placeholder="my-project"
          autocomplete="off"
          class="text-input"
          @input="nameEdited = true"
          @keydown.enter="handleCreate"
        >
      </div>

      <p v-if="nameError" class="error-text">
        {{ nameError }}
      </p>

      <p v-if="error" class="error-text">
        {{ error }}
      </p>

      <p class="hint-text">
        <template v-if="mode === 'init'">
          A bare repository <code>{{ repoName || 'name' }}.git</code> will be created.
        </template>
        <template v-else>
          The remote will be cloned as a bare repository into <code>{{ repoName || 'name' }}.git</code>.
        </template>
      </p>

      <TerminalOutput v-if="displayedOp" :operation="displayedOp" />
    </div>

    <template #actions>
      <ActionButton
        :label="mode === 'clone' ? 'Clone' : 'Create'"
        :icon="mode === 'clone' ? 'i-carbon-download' : 'i-carbon-add'"
        :loading="loading || repoRunning"
        :disabled="!canSubmit"
        @click="handleCreate"
      />
    </template>
  </ModalDialog>
</template>

<style scoped>
.mode-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background-color: var(--bg-elevated);
  border-radius: var(--border-radius-md);
  margin-bottom: var(--space-4);
}

.mode-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 1;
  justify-content: center;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  background: none;
  border: none;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.mode-tab--active {
  color: var(--text-primary);
  background-color: var(--bg-surface);
  box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.06));
}

.mode-tab:not(.mode-tab--active):hover {
  color: var(--text-primary);
}

.creator-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.text-input {
  height: 2rem;
  width: 100%;
  padding: 0 var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.text-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.text-input::placeholder {
  color: var(--text-muted);
}

.error-text {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}

.hint-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
</style>
