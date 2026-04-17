import type { TaskDefinition, TaskDefinitionV2 } from '../../../src/types'
import { describe, expect, it } from 'vitest'
import { parseTaskDefinition, parseTaskDefinitionV2, toTaskSummary, toTaskSummaryV2, tryParseTaskDefinition } from '../../../src/services/tasks'

describe('parseTaskDefinition', () => {
  it('should parse valid task definition', () => {
    const yaml = `
title: Test Task
nodes:
  - id: start
    role: pm
    prompt: Analyze requirements
  - id: end
    role: human_approval
    prompt: Approve the task
edges:
  - from: start
    to: end
    condition: success
`
    const result = parseTaskDefinition(yaml, 'test.yaml')

    expect(result.valid).toBe(true)
    expect(result.title).toBe('Test Task')
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0].id).toBe('start')
    expect(result.nodes[0].role).toBe('pm')
    expect(result.edges).toHaveLength(1)
  })

  it('should throw error for invalid YAML', () => {
    expect(() => {
      parseTaskDefinition('invalid: yaml: [', 'test.yaml')
    }).toThrow()
  })

  it('should throw error for empty nodes', () => {
    const yaml = `
title: Test Task
nodes: []
edges: []
`
    expect(() => {
      parseTaskDefinition(yaml, 'test.yaml')
    }).toThrow()
  })

  it('should throw error for duplicate node ids', () => {
    const yaml = `
title: Test Task
nodes:
  - id: start
    role: pm
  - id: start
    role: developer
edges: []
`
    expect(() => {
      parseTaskDefinition(yaml, 'test.yaml')
    }).toThrow()
  })

  it('should throw error for invalid role', () => {
    const yaml = `
title: Test Task
nodes:
  - id: start
    role: invalid_role
edges: []
`
    expect(() => {
      parseTaskDefinition(yaml, 'test.yaml')
    }).toThrow()
  })

  it('should throw error for unsupported edge condition', () => {
    const yaml = `
title: Test Task
nodes:
  - id: start
    role: pm
edges:
  - from: start
    to: end
    condition: invalid_condition
`
    expect(() => {
      parseTaskDefinition(yaml, 'test.yaml')
    }).toThrow()
  })

  it('should allow terminal end edge without declaring an end node', () => {
    const yaml = `
title: Terminal End Task
nodes:
  - id: start
    role: pm
edges:
  - from: start
    to: end
    condition: success
`
    const result = parseTaskDefinition(yaml, 'test.yaml')

    expect(result.valid).toBe(true)
    expect(result.nodes).toHaveLength(1)
    expect(result.edges[0].to).toBe('end')
  })
  it('should detect unsupported cycles', () => {
    const yaml = `
title: Test Task
nodes:
  - id: a
    role: pm
  - id: b
    role: pm
edges:
  - from: a
    to: b
  - from: b
    to: a
`
    expect(() => {
      parseTaskDefinition(yaml, 'test.yaml')
    }).toThrow()
  })

  it('should allow reviewer-developer cycle', () => {
    const yaml = `
title: Test Task
nodes:
  - id: pm
    role: pm
  - id: developer
    role: developer
  - id: reviewer
    role: reviewer
  - id: end
    role: human_approval
edges:
  - from: pm
    to: developer
    condition: success
  - from: developer
    to: reviewer
    condition: success
  - from: reviewer
    to: developer
    condition: needs_changes
  - from: reviewer
    to: end
    condition: success
`
    const result = parseTaskDefinition(yaml, 'test.yaml')
    expect(result.valid).toBe(true)
  })
})

describe('tryParseTaskDefinition', () => {
  it('should return valid result for valid YAML', () => {
    const yaml = `
title: Test Task
nodes:
  - id: start
    role: pm
  - id: end
    role: human_approval
edges:
  - from: start
    to: end
`
    const result = tryParseTaskDefinition(yaml, 'test.yaml')

    expect(result.valid).toBe(true)
    expect(result.parseError).toBeNull()
  })

  it('should return invalid result for invalid YAML instead of throwing', () => {
    const result = tryParseTaskDefinition('invalid yaml [', 'test.yaml')

    expect(result.valid).toBe(false)
    expect(result.parseError).not.toBeNull()
    expect(result.validationErrors.length).toBeGreaterThan(0)
  })

  it.each([
    [''],
    ['plain scalar'],
    ['- array item'],
  ])('should return parse error for malformed task content %#', (yaml) => {
    const result = tryParseTaskDefinition(yaml, 'bad.yaml')

    expect(result.valid).toBe(false)
    expect(result.parseError).not.toBeNull()
    expect(result.validationErrors.length).toBeGreaterThan(0)
  })

  it('should return validation errors without throwing for semantically invalid content', () => {
    const result = tryParseTaskDefinition('title: Bad\nnodes: []\nedges: []', 'bad.yaml')

    expect(result.valid).toBe(false)
    expect(result.parseError).toBeNull()
    expect(result.validationErrors).toContain('nodes must be a non-empty array')
  })
})

describe('parseTaskDefinitionV2', () => {
  it('should parse the minimal valid v2 format', () => {
    const result = parseTaskDefinitionV2(`
title: Minimal V2
description: Do the work.
`, 'minimal.yaml')

    expect(result).toMatchObject({
      path: 'minimal.yaml',
      title: 'Minimal V2',
      description: 'Do the work.',
      baseBranch: 'main',
      require_approval: false,
      acceptance: null,
      executor: null,
      valid: true,
      parseError: null,
      version: 2,
      hasHumanApproval: false,
    })
  })

  it('should parse approval, acceptance, and executor settings', () => {
    const result = parseTaskDefinitionV2(`
title: Full V2
description: Run a longer task.
base_branch: develop
require_approval: true
acceptance:
  commands:
    - npm test
    - pnpm build
  timeout: "600000"
  fail_fast: false
executor:
  max_turns: "80"
  timeout: 10800000
  max_continuations: "3"
`, 'full.yaml')

    expect(result.valid).toBe(true)
    expect(result.baseBranch).toBe('develop')
    expect(result.require_approval).toBe(true)
    expect(result.hasHumanApproval).toBe(true)
    expect(result.acceptance).toEqual({
      commands: ['npm test', 'pnpm build'],
      timeout: 600000,
      fail_fast: false,
    })
    expect(result.executor).toEqual({
      max_turns: 80,
      timeout: 10800000,
      max_continuations: 3,
    })
  })

  it.each([
    [''],
    ['plain scalar'],
    ['- array item'],
    ['invalid: yaml: ['],
  ])('should return invalid v2 result for malformed root %#', (yaml) => {
    const result = parseTaskDefinitionV2(yaml, 'bad-v2.yaml')

    expect(result.valid).toBe(false)
    expect(result.parseError).not.toBeNull()
    expect(result.validationErrors.length).toBeGreaterThan(0)
  })

  it('should fall back to executor and acceptance defaults for invalid numeric values', () => {
    const result = parseTaskDefinitionV2(`
title: Defaults
description: Defaults for invalid numbers.
acceptance:
  commands:
    - npm test
  timeout: 0
executor:
  max_turns: -1
  timeout: nope
  max_continuations: 0
`, 'defaults.yaml')

    expect(result.valid).toBe(true)
    expect(result.acceptance).toEqual({
      commands: ['npm test'],
      timeout: 300000,
      fail_fast: true,
    })
    expect(result.executor).toEqual({
      max_turns: 30,
      timeout: 1800000,
    })
  })

  it('should migrate v1 task definitions through the public v2 parser', () => {
    const result = parseTaskDefinitionV2(`
title: Legacy Task
base_branch: release
nodes:
  - id: developer
    role: developer
    prompt: Implement the legacy task.
  - id: tester
    role: tester
    tools:
      - run:npm test
  - id: approval
    role: human_approval
edges:
  - from: developer
    to: tester
    condition: success
  - from: tester
    to: approval
    condition: success
`, 'legacy.yaml')

    expect(result.valid).toBe(true)
    expect(result.version).toBe(2)
    expect(result.title).toBe('Legacy Task')
    expect(result.description).toBe('Implement the legacy task.')
    expect(result.baseBranch).toBe('release')
    expect(result.require_approval).toBe(true)
    expect(result.hasHumanApproval).toBe(true)
    expect(result.acceptance).toEqual({
      commands: ['npm test'],
      timeout: 300000,
      fail_fast: true,
    })
    expect(result.nodeCount).toBe(3)
    expect(result.edgeCount).toBe(2)
  })
})

describe('toTaskSummary', () => {
  it('should convert TaskDefinition to TaskSummary', () => {
    const definition: TaskDefinition = {
      path: 'test.yaml',
      title: 'Test Task',
      baseBranch: 'main',
      maxIterations: 5,
      nodes: [
        { id: 'start', role: 'pm', prompt: 'Analyze', tools: [] },
        { id: 'implement', role: 'developer', prompt: 'Implement', tools: [] },
      ],
      edges: [
        { from: 'start', to: 'implement', condition: 'success' },
        { from: 'implement', to: 'end', condition: null },
      ],
      roles: ['pm', 'developer'],
      hasHumanApproval: false,
      valid: true,
      validationErrors: [],
      parseError: null,
    }

    const summary = toTaskSummary(definition)

    expect(summary.path).toBe('test.yaml')
    expect(summary.title).toBe('Test Task')
    expect(summary.baseBranch).toBe('main')
    expect(summary.maxIterations).toBe(5)
    expect(summary.nodeCount).toBe(2)
    expect(summary.edgeCount).toBe(2)
    expect(summary.roles).toEqual(['pm', 'developer'])
    expect(summary.hasHumanApproval).toBe(false)
    expect(summary.valid).toBe(true)
  })
})

describe('toTaskSummaryV2', () => {
  it('should convert TaskDefinitionV2 to TaskSummary', () => {
    const definition: TaskDefinitionV2 = {
      path: 'test.yaml',
      title: 'Test Task V2',
      description: 'This is a v2 format task',
      baseBranch: 'main',
      require_approval: false,
      acceptance: {
        commands: ['npm test'],
        timeout: 300000,
        fail_fast: true,
      },
      executor: {
        max_turns: 30,
        timeout: 1800000,
      },
      valid: true,
      validationErrors: [],
      parseError: null,
      version: 2,
      hasHumanApproval: false,
    }

    const summary = toTaskSummaryV2(definition)

    expect(summary.path).toBe('test.yaml')
    expect(summary.title).toBe('Test Task V2')
    expect(summary.baseBranch).toBe('main')
    expect(summary.maxIterations).toBeNull()
    expect(summary.nodeCount).toBe(0)
    expect(summary.edgeCount).toBe(0)
    expect(summary.roles).toEqual([])
    expect(summary.hasHumanApproval).toBe(false)
    expect(summary.valid).toBe(true)
  })

  it('should handle v2 task with require_approval', () => {
    const definition: TaskDefinitionV2 = {
      path: 'approval-task.yaml',
      title: 'Approval Task',
      description: 'Task requiring approval',
      baseBranch: 'develop',
      require_approval: true,
      acceptance: null,
      executor: null,
      valid: true,
      validationErrors: [],
      parseError: null,
      version: 2,
      hasHumanApproval: true,
    }

    const summary = toTaskSummaryV2(definition)

    expect(summary.hasHumanApproval).toBe(true)
    expect(summary.baseBranch).toBe('develop')
    expect(summary.valid).toBe(true)
  })
})
