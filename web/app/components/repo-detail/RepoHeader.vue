<script setup lang="ts">
const props = defineProps<{
  name: string
  branches: string[]
  selectedBranch?: string
  sshUrl: string
}>()

const emit = defineEmits<{
  'update:selectedBranch': [branch: string]
}>()

const copied = ref(false)

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(props.sshUrl)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  }
  catch {
    // clipboard API not available
  }
}
</script>

<template>
  <div class="repo-header">
    <NuxtLink to="/" class="back-link">
      <Icon name="i-carbon-arrow-left" />
      Repositories
    </NuxtLink>

    <h1 class="repo-title">
      <Icon name="i-carbon-repo-source-code" class="repo-icon" />
      {{ name }}
    </h1>

    <hr class="divider">

    <div class="branch-row">
      <BranchSelector
        v-if="branches.length"
        :model-value="selectedBranch"
        :branches="branches"
        @update:model-value="emit('update:selectedBranch', $event)"
      />
    </div>

    <div class="ssh-box">
      <label class="ssh-label">SSH Clone URL</label>
      <div class="ssh-row">
        <code class="ssh-url">{{ sshUrl }}</code>
        <button
          class="copy-btn"
          :title="copied ? 'Copied!' : 'Copy'"
          @click="copyUrl"
        >
          <Icon :name="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" :class="copied ? 'copy-icon--success' : ''" class="copy-icon" />
        </button>
      </div>
      <div class="ssh-hints">
        <div>
          <span class="hint-label">Clone:</span>
          <code class="hint-code">git clone {{ sshUrl }}</code>
        </div>
        <div>
          <span class="hint-label">Or existing repo:</span>
          <code class="hint-code">git remote add git-nest {{ sshUrl }}</code>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.repo-header {
  margin-bottom: var(--space-6);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-3);
  transition: color var(--transition-fast);
}

.back-link:hover {
  color: var(--color-primary);
}

.repo-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.repo-icon {
  color: var(--color-primary);
}

.divider {
  margin: var(--space-4) 0;
  border: none;
  border-top: 1px solid var(--border-color);
}

.branch-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.ssh-box {
  margin-top: var(--space-6);
  padding: var(--space-3);
  border-radius: var(--border-radius-lg);
  background-color: var(--bg-elevated);
}

.ssh-label {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.ssh-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.ssh-url {
  flex: 1;
  font-size: var(--font-size-sm);
  font-family: monospace;
  color: var(--text-primary);
  word-break: break-all;
}

.copy-btn {
  padding: var(--space-1);
  border-radius: var(--border-radius-sm);
  background: none;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color var(--transition-fast);
}

.copy-btn:hover {
  background-color: var(--border-color);
}

.copy-icon {
  font-size: var(--font-size-sm);
}

.copy-icon--success {
  color: var(--color-success);
}

.ssh-hints {
  margin-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.hint-label {
  color: var(--text-muted);
}

.hint-code {
  color: var(--text-secondary);
  margin-left: var(--space-1);
}
</style>
