<script setup lang="ts">
import type { TaskCreateInput, TaskTemplate } from '#shared/types/task-creator'
import { TASK_TEMPLATES } from '#shared/types/task-creator'

const props = defineProps<{
  branches: string[]
  selectedBranch?: string
  creating: boolean
  error: string
}>()

const emit = defineEmits<{
  create: [payload: TaskCreateInput]
}>()

const visible = defineModel<boolean>({ default: false })

const selectedTemplateId = ref('feature')
const title = ref('')
const description = ref('')
const baseBranch = ref('')
const requireApproval = ref(true)
const acceptanceCommandsText = ref('pnpm lint\npnpm typecheck')
const acceptanceTimeoutMinutes = ref(5)
const acceptanceFailFast = ref(true)
const executorMaxTurns = ref(40)
const executorTimeoutMinutes = ref(40)
const executorMaxContinuations = ref(2)
const fileName = ref('')

function getDefaultTemplate(): TaskTemplate {
  const template = TASK_TEMPLATES[0]
  if (!template)
    throw new Error('Task templates are not configured')
  return template
}

const selectedTemplate = computed<TaskTemplate>(() => {
  return TASK_TEMPLATES.find(template => template.id === selectedTemplateId.value) || getDefaultTemplate()
})

const branchOptions = computed(() => {
  const values = new Set<string>()
  if (props.selectedBranch)
    values.add(props.selectedBranch)
  for (const branch of props.branches)
    values.add(branch)
  return [...values].map(branch => ({ value: branch, label: branch }))
})

const acceptanceCommands = computed(() => {
  return acceptanceCommandsText.value
    .split(/\r?\n/)
    .map(command => command.trim())
    .filter(Boolean)
})

const generatedFileName = computed(() => {
  const source = fileName.value || title.value || selectedTemplate.value.label
  const basename = source
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\.(ya?ml)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'task'
  return `${basename}.yaml`
})

const payload = computed<TaskCreateInput>(() => ({
  templateId: selectedTemplateId.value,
  title: title.value || selectedTemplate.value.label,
  description: description.value || selectedTemplate.value.description,
  baseBranch: baseBranch.value || props.selectedBranch || 'main',
  requireApproval: requireApproval.value,
  acceptanceCommands: acceptanceCommands.value,
  acceptanceTimeout: acceptanceTimeoutMinutes.value * 60000,
  acceptanceFailFast: acceptanceFailFast.value,
  executorMaxTurns: executorMaxTurns.value,
  executorTimeout: executorTimeoutMinutes.value * 60000,
  executorMaxContinuations: executorMaxContinuations.value,
  fileName: generatedFileName.value,
}))

const yamlPreview = computed(() => {
  const lines = [
    'version: 2',
    `title: ${quoteYaml(payload.value.title || '')}`,
    'description: |-',
    ...String(payload.value.description || '').split(/\r?\n/).map(line => `  ${line}`),
    `base_branch: ${quoteYaml(payload.value.baseBranch || 'main')}`,
    `require_approval: ${payload.value.requireApproval ? 'true' : 'false'}`,
  ]

  if (acceptanceCommands.value.length) {
    lines.push('acceptance:')
    lines.push('  commands:')
    for (const command of acceptanceCommands.value)
      lines.push(`    - ${quoteYaml(command)}`)
    lines.push(`  timeout: ${payload.value.acceptanceTimeout}`)
    lines.push(`  fail_fast: ${payload.value.acceptanceFailFast ? 'true' : 'false'}`)
  }

  lines.push('executor:')
  lines.push(`  max_turns: ${payload.value.executorMaxTurns}`)
  lines.push(`  timeout: ${payload.value.executorTimeout}`)
  lines.push(`  max_continuations: ${payload.value.executorMaxContinuations}`)

  return lines.join('\n')
})

watch(selectedTemplateId, () => {
  const template = selectedTemplate.value
  if (!title.value)
    title.value = template.label
  if (!description.value)
    description.value = template.description
  requireApproval.value = template.requireApproval
  acceptanceCommandsText.value = template.acceptanceCommands.join('\n')
  executorMaxTurns.value = template.executor.max_turns
  executorTimeoutMinutes.value = Math.round(template.executor.timeout / 60000)
  executorMaxContinuations.value = template.executor.max_continuations
}, { immediate: true })

watch(() => props.selectedBranch, (branch) => {
  if (!baseBranch.value && branch)
    baseBranch.value = branch
}, { immediate: true })

function quoteYaml(value: string) {
  return JSON.stringify(value)
}

function submit() {
  emit('create', payload.value)
}
</script>

<template>
  <ModalDialog v-model="visible" title="Create Task" size="wide">
    <div class="creator-layout">
      <div class="creator-form">
        <div class="field">
          <label class="field-label">Template</label>
          <div class="template-grid">
            <button
              v-for="template in TASK_TEMPLATES"
              :key="template.id"
              type="button"
              class="template-option"
              :class="{ 'template-option--active': selectedTemplateId === template.id }"
              @click="selectedTemplateId = template.id"
            >
              <span class="template-title">{{ template.label }}</span>
              <span class="template-description">{{ template.description }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="task-title">Title</label>
          <input id="task-title" v-model="title" class="text-input" type="text">
        </div>

        <div class="field">
          <label class="field-label" for="task-description">Goal</label>
          <textarea id="task-description" v-model="description" class="text-area" rows="6" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label">Base branch</label>
            <BranchSelector
              v-if="branchOptions.length"
              v-model="baseBranch"
              :options="branchOptions"
            />
            <input v-else v-model="baseBranch" class="text-input" type="text" placeholder="main">
          </div>

          <div class="field">
            <label class="field-label" for="task-file">File name</label>
            <input id="task-file" v-model="fileName" class="text-input" type="text" :placeholder="generatedFileName">
          </div>
        </div>

        <div class="field checkbox-field">
          <input id="require-approval" v-model="requireApproval" type="checkbox">
          <label for="require-approval">Require approval before acceptance and push</label>
        </div>

        <div class="field">
          <label class="field-label" for="acceptance-commands">Acceptance commands</label>
          <textarea id="acceptance-commands" v-model="acceptanceCommandsText" class="text-area mono" rows="4" placeholder="pnpm lint" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="acceptance-timeout">Acceptance minutes</label>
            <input id="acceptance-timeout" v-model.number="acceptanceTimeoutMinutes" class="text-input" type="number" min="1">
          </div>
          <div class="field checkbox-field checkbox-field--grid">
            <input id="acceptance-fail-fast" v-model="acceptanceFailFast" type="checkbox">
            <label for="acceptance-fail-fast">Stop on first failed command</label>
          </div>
        </div>

        <div class="form-grid form-grid--three">
          <div class="field">
            <label class="field-label" for="executor-turns">Turns</label>
            <input id="executor-turns" v-model.number="executorMaxTurns" class="text-input" type="number" min="1">
          </div>
          <div class="field">
            <label class="field-label" for="executor-timeout">Executor minutes</label>
            <input id="executor-timeout" v-model.number="executorTimeoutMinutes" class="text-input" type="number" min="1">
          </div>
          <div class="field">
            <label class="field-label" for="executor-continuations">Continuations</label>
            <input id="executor-continuations" v-model.number="executorMaxContinuations" class="text-input" type="number" min="1">
          </div>
        </div>
      </div>

      <div class="preview-panel">
        <div class="preview-header">
          <span>.git-nest/tasks/{{ generatedFileName }}</span>
        </div>
        <pre class="yaml-preview">{{ yamlPreview }}</pre>
      </div>
    </div>

    <div v-if="error" class="error-text">
      {{ error }}
    </div>

    <template #actions>
      <ActionButton
        label="Create Task"
        icon="i-carbon-add"
        :loading="creating"
        :disabled="!title.trim() && !description.trim()"
        @click="submit"
      />
    </template>
  </ModalDialog>
</template>

<style scoped>
.creator-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
  gap: var(--space-4);
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

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.template-option {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 4.5rem;
  padding: var(--space-3);
  text-align: left;
  background-color: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  cursor: pointer;
}

.template-option--active {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.template-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.template-description {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.4;
}

.text-input,
.text-area {
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

.text-input {
  height: 2rem;
}

.text-area {
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
  resize: vertical;
}

.text-input:focus,
.text-area:focus {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.text-input::placeholder,
.text-area::placeholder {
  color: var(--text-muted);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.form-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.checkbox-field--grid {
  align-self: end;
  min-height: 2.25rem;
}

.preview-panel {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  overflow: hidden;
  background-color: var(--bg-elevated);
}

.preview-header {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.yaml-preview {
  min-height: 100%;
  max-height: 34rem;
  margin: 0;
  padding: var(--space-3);
  overflow: auto;
  font-size: var(--font-size-xs);
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.error-text {
  margin-top: var(--space-3);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

@media (max-width: 760px) {
  .creator-layout,
  .template-grid,
  .form-grid,
  .form-grid--three {
    grid-template-columns: 1fr;
  }
}
</style>
