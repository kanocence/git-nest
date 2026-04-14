import type { TaskDefinition, TaskDefinitionV2 } from '../../../src/types'
import { describe, expect, it } from 'vitest'
import { parseTaskDefinition, toTaskSummary, toTaskSummaryV2, tryParseTaskDefinition } from '../../../src/services/tasks'

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
