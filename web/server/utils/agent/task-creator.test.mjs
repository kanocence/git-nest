/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('#shared/')) {
      const sharedPath = path.resolve('shared', `${specifier.slice('#shared/'.length)}.ts`)
      return nextResolve(pathToFileURL(sharedPath).href, context)
    }
    if (specifier.startsWith('./') && path.extname(specifier) === '') {
      try {
        return nextResolve(`${specifier}.ts`, context)
      }
      catch {
        return nextResolve(specifier, context)
      }
    }
    return nextResolve(specifier, context)
  },
})

const { buildTaskYaml, slugifyTaskFileName } = await import('./task-creator.ts')
const { parseTaskDefinitionV2 } = await import('./tasks.ts')
const { TASK_TEMPLATES } = await import('#shared/types/task-creator')

test('slugifyTaskFileName creates a safe task yaml path', () => {
  assert.equal(slugifyTaskFileName('Fix: Login timeout!'), '.git-nest/tasks/fix-login-timeout.yaml')
  assert.equal(slugifyTaskFileName('修复 登录 超时'), '.git-nest/tasks/task.yaml')
  assert.equal(slugifyTaskFileName('already.yaml'), '.git-nest/tasks/already.yaml')
})

test('buildTaskYaml creates valid v2 YAML from feature template input', () => {
  const result = buildTaskYaml({
    templateId: 'feature',
    title: 'Add task creator',
    description: 'Build a form that creates task YAML files.',
    baseBranch: 'main',
    requireApproval: true,
    acceptanceCommands: ['pnpm lint', 'pnpm typecheck'],
    acceptanceTimeout: 600000,
    acceptanceFailFast: true,
    executorMaxTurns: 40,
    executorTimeout: 2400000,
    executorMaxContinuations: 3,
    fileName: 'task-creator.yaml',
  })

  assert.equal(result.filePath, '.git-nest/tasks/task-creator.yaml')
  const parsed = parseTaskDefinitionV2(result.content, result.filePath)
  assert.equal(parsed.valid, true)
  assert.equal(parsed.title, 'Add task creator')
  assert.equal(parsed.require_approval, true)
  assert.deepEqual(parsed.acceptance?.commands, ['pnpm lint', 'pnpm typecheck'])
  assert.equal(parsed.executor?.max_turns, 40)
})

test('buildTaskYaml applies template defaults when optional fields are omitted', () => {
  const result = buildTaskYaml({
    templateId: 'docs',
    title: 'Update deployment docs',
    description: 'Document the custom code-server workflow.',
    baseBranch: '',
    requireApproval: false,
    acceptanceCommands: [],
    fileName: '',
  })

  assert.equal(result.filePath, '.git-nest/tasks/update-deployment-docs.yaml')
  const parsed = parseTaskDefinitionV2(result.content, result.filePath)
  assert.equal(parsed.valid, true)
  assert.equal(parsed.baseBranch, 'main')
  assert.deepEqual(parsed.acceptance?.commands, ['pnpm lint'])
})

test('task templates expose the expected choices', () => {
  assert.deepEqual(
    TASK_TEMPLATES.map(template => template.id),
    ['bugfix', 'feature', 'refactor', 'ui-polish', 'docs', 'investigation'],
  )
})
