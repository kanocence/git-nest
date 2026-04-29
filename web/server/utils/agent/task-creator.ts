import type { TaskCreateInput, TaskTemplate } from '#shared/types/task-creator'
import { stringify } from 'yaml'
import { TASK_TEMPLATES } from '#shared/types/task-creator'
import { parseTaskDefinitionV2 } from './tasks'

export interface BuiltTaskYaml {
  filePath: string
  content: string
}

function getTemplate(templateId: string | undefined): TaskTemplate {
  const template = TASK_TEMPLATES.find(template => template.id === templateId) || TASK_TEMPLATES[0]
  if (!template) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Task templates are not configured',
      data: { code: 'TASK_TEMPLATES_EMPTY' },
    })
  }
  return template
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function normalizeCommands(commands: unknown, fallback: string[]): string[] {
  if (!Array.isArray(commands))
    return fallback
  const normalized = commands
    .filter((command): command is string => typeof command === 'string' && Boolean(command.trim()))
    .map(command => command.trim())
  return normalized.length ? normalized : fallback
}

function normalizeFileName(fileName: string): string {
  const trimmed = fileName.trim().replace(/\\/g, '/').split('/').pop() || ''
  const withoutExtension = trimmed.replace(/\.(ya?ml)$/i, '')
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return `${slug || 'task'}.yaml`
}

export function slugifyTaskFileName(input: string): string {
  return `.git-nest/tasks/${normalizeFileName(input)}`
}

export function buildTaskYaml(input: TaskCreateInput): BuiltTaskYaml {
  const template = getTemplate(input.templateId)
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : template.label
  const description = typeof input.description === 'string' && input.description.trim()
    ? input.description.trim()
    : template.description
  const baseBranch = typeof input.baseBranch === 'string' && input.baseBranch.trim() ? input.baseBranch.trim() : 'main'
  const commands = normalizeCommands(input.acceptanceCommands, template.acceptanceCommands)
  const executorMaxContinuations = asPositiveInt(input.executorMaxContinuations, template.executor.max_continuations)

  const rawTask: Record<string, unknown> = {
    version: 2,
    title,
    description,
    base_branch: baseBranch,
    require_approval: typeof input.requireApproval === 'boolean' ? input.requireApproval : template.requireApproval,
  }

  if (commands.length) {
    rawTask.acceptance = {
      commands,
      timeout: asPositiveInt(input.acceptanceTimeout, 300000),
      fail_fast: typeof input.acceptanceFailFast === 'boolean' ? input.acceptanceFailFast : true,
    }
  }

  rawTask.executor = {
    max_turns: asPositiveInt(input.executorMaxTurns, template.executor.max_turns),
    timeout: asPositiveInt(input.executorTimeout, template.executor.timeout),
    ...(executorMaxContinuations > 0 ? { max_continuations: executorMaxContinuations } : {}),
  }

  const filePath = slugifyTaskFileName(input.fileName || title)
  const content = stringify(rawTask, { lineWidth: 0 })
  const parsed = parseTaskDefinitionV2(content, filePath)
  if (!parsed.valid) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Generated task YAML failed validation',
      data: {
        code: 'INVALID_GENERATED_TASK_YAML',
        errors: parsed.validationErrors,
      },
    })
  }

  return { filePath, content }
}
