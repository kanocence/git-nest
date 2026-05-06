<script setup lang="ts">
import type { WorkspaceOverviewState } from '~/composables/workspaceOverview'
import type { AiRunRecord, RepoInfo } from '~/types'

const props = defineProps<{
  repo: RepoInfo
  activeRun?: AiRunRecord
  workspace?: WorkspaceOverviewState
  workspaceLoading?: boolean
  branches?: string[]
  branchesLoading?: boolean
  expanded?: boolean
  timeAgo?: string
  isRunning?: boolean
}>()

const emit = defineEmits<{
  toggleBranches: [repo: string]
  clone: [repo: string]
  pull: [repo: string]
}>()

const { public: { codeServerUrl } } = useRuntimeConfig()

// pending = only during active loading; failed fetches (workspace stays undefined) are treated as "not cloned"
const workspacePending = computed(() => props.workspaceLoading ?? false)

const workspaceBadge = computed(() => {
  if (workspacePending.value)
    return null
  const workspace = props.workspace
  if (!workspace)
    return null
  if (!workspace.exists)
    return { label: 'not cloned', tone: 'muted' }
  if (workspace.occupiedByAi)
    return null
  if (workspace.clean === false)
    return { label: 'dirty', tone: 'warning' }
  return { label: 'clean', tone: 'success' }
})

const aiTone = computed(() => {
  const status = props.activeRun?.status
  if (status === 'waiting_approval' || status === 'waiting_continuation')
    return 'warning'
  if (status === 'running')
    return 'info'
  return 'default'
})

const editorUrl = computed(() => {
  if (!codeServerUrl || !props.workspace?.exists)
    return ''
  return `${codeServerUrl.replace(/\/$/, '')}/?folder=/workspace/${props.repo.name}`
})
</script>

<template>
  <div class="workspace-block">
    <div class="block-header">
      <NuxtLink :to="`/repos/${repo.name}`" class="block-title">
        <Icon name="i-carbon-repo-source-code" class="block-repo-icon" />
        <span>{{ repo.name }}</span>
      </NuxtLink>
      <div class="block-actions">
        <span
          v-if="workspaceBadge"
          class="ws-badge"
          :class="`ws-badge--${workspaceBadge.tone}`"
        >
          {{ workspaceBadge.label }}
        </span>
        <NuxtLink
          v-if="activeRun"
          :to="{ name: 'tasks-id', params: { id: activeRun.id } }"
          class="ai-badge"
          :class="`ai-badge--${aiTone}`"
        >
          <Icon name="i-carbon-machine-learning-model" class="ai-badge-icon" />
          {{ activeRun.status.replace(/_/g, ' ') }}
        </NuxtLink>
      </div>
    </div>

    <div class="block-meta">
      <span class="meta-item">
        <Icon name="i-carbon-time" class="meta-icon" />
        {{ timeAgo }}
      </span>
      <span v-if="repo.headBranch" class="head-branch">
        <Icon name="i-carbon-branch" class="meta-icon" />
        {{ repo.headBranch }}
      </span>
      <span v-if="workspace?.currentBranch" class="meta-item">
        workspace <code>{{ workspace.currentBranch }}</code>
      </span>
    </div>

    <div class="workspace-actions">
      <ActionButton
        v-if="!workspace?.exists"
        :label="workspacePending ? 'Checking' : 'Clone Workspace'"
        icon="i-carbon-download"
        variant="secondary"
        :loading="isRunning"
        :disabled="workspacePending"
        @click="emit('clone', repo.name)"
      />
      <ActionButton
        v-else
        label="Pull"
        icon="i-carbon-cloud-download"
        variant="secondary"
        :loading="isRunning"
        @click="emit('pull', repo.name)"
      />
      <a
        v-if="editorUrl"
        :href="editorUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="editor-link"
      >
        <Icon name="i-carbon-code" />
        Editor
      </a>
      <NuxtLink :to="`/repos/${repo.name}`" class="details-link">
        <Icon name="i-carbon-launch" />
        Details
      </NuxtLink>
    </div>

    <button class="branches-toggle" type="button" @click="emit('toggleBranches', repo.name)">
      <Icon :name="expanded ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" class="toggle-chevron" />
      Branches
      <span v-if="branches" class="branch-count">{{ branches.length }}</span>
    </button>

    <div v-if="expanded" class="branches-list">
      <div v-if="branchesLoading" class="branches-loading">
        Loading branches...
      </div>
      <template v-else-if="branches?.length">
        <span
          v-for="branch in branches"
          :key="branch"
          class="branch-chip"
          :class="{ 'branch-chip--head': branch === repo.headBranch }"
        >
          {{ branch }}
        </span>
      </template>
      <span v-else class="empty-branches">No branches</span>
    </div>
  </div>
</template>

<style scoped>
.workspace-block {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-xl);
  padding: var(--space-4);
  background-color: var(--bg-surface);
  transition: border-color var(--transition-fast);
}

.workspace-block:hover {
  border-color: var(--color-primary);
}

.block-header,
.block-actions,
.block-meta,
.meta-item,
.head-branch,
.workspace-actions,
.branches-toggle {
  display: flex;
  align-items: center;
}

.block-header {
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.block-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.block-title:hover,
.block-repo-icon {
  color: var(--color-primary);
}

.block-actions,
.workspace-actions {
  gap: var(--space-2);
}

.block-meta {
  flex-wrap: wrap;
  gap: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}

.meta-item,
.head-branch {
  gap: var(--space-1);
}

.meta-icon {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.head-branch,
.ws-badge,
.ai-badge,
.branch-chip {
  border-radius: 9999px;
}

.head-branch {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
  padding: 2px var(--space-2);
}

.ws-badge,
.ai-badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  padding: 2px var(--space-2);
}

.ai-badge {
  gap: var(--space-1);
  text-decoration: none;
  transition: opacity var(--transition-fast);
}

.ai-badge:hover {
  opacity: 0.8;
}

.ai-badge--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

.ai-badge--warning,
.ws-badge--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.ai-badge--default,
.ws-badge--muted {
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}

.ws-badge--muted {
  color: var(--text-muted);
}

.ws-badge--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.workspace-actions {
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

.editor-link,
.details-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 2rem;
  padding: 0 var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--border-radius-md);
  text-decoration: none;
}

.editor-link {
  color: var(--text-inverse);
  background-color: var(--color-info);
}

.details-link {
  color: var(--text-secondary);
  background-color: var(--bg-elevated);
}

.branches-toggle {
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--border-radius-sm);
  transition: background-color var(--transition-fast);
}

.branches-toggle:hover {
  background-color: var(--bg-elevated);
  color: var(--text-primary);
}

.toggle-chevron,
.branch-count,
.ai-badge-icon {
  font-size: var(--font-size-xs);
}

.branch-count {
  color: var(--text-muted);
}

.branches-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-color);
}

.branches-loading,
.empty-branches {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.branch-chip {
  font-size: var(--font-size-xs);
  padding: 2px var(--space-2);
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.branch-chip--head {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
</style>
