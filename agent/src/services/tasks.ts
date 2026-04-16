import type { TaskDefinition, TaskDefinitionV2, TaskEdge, TaskNode, TaskSummary } from '../types'
import path from 'node:path'
import { parseDocument } from 'yaml'
import { warn } from '../logger'
import { AppError } from '../utils/errors'

const ALLOWED_ROLES = new Set<string>([
  'pm',
  'developer',
  'tester',
  'reviewer',
  'human_approval',
])

const ALLOWED_EDGE_CONDITIONS = new Set<string>([
  'success',
  'needs_changes',
  'approved',
  'rejected',
  'failed',
])

const DIGITS_ONLY_RE = /^\d+$/
const TASK_END_NODE_ID = 'end'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0)
    return value

  if (typeof value === 'string' && DIGITS_ONLY_RE.test(value.trim()))
    return Number.parseInt(value.trim(), 10)

  return null
}

function detectCycle(nodeIds: Set<string>, edges: TaskEdge[], nodes: TaskNode[]): boolean {
  const adjacency = new Map<string, Array<{ to: string, condition: string | null }>>()
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const nodeRoleMap = new Map(nodes.map(n => [n.id, n.role]))

  for (const nodeId of nodeIds)
    adjacency.set(nodeId, [])

  for (const edge of edges) {
    if (edge.to !== TASK_END_NODE_ID || nodeIds.has(TASK_END_NODE_ID))
      adjacency.get(edge.from)?.push({ to: edge.to, condition: edge.condition })
  }

  function dfs(nodeId: string, path: Array<{ nodeId: string, role: string }> = []): boolean {
    if (visiting.has(nodeId)) {
      const cycleStart = path.findIndex(p => p.nodeId === nodeId)
      if (cycleStart >= 0) {
        const cycle = path.slice(cycleStart)
        const cycleRoles = cycle.map(n => n.role)

        // 检查是否是允许的 reviewer <-> developer 循环
        // 条件：恰好 2 个节点，且角色恰好是 reviewer 和 developer
        if (cycleRoles.length === 2) {
          const roleSet = new Set(cycleRoles)
          if (roleSet.has('reviewer') && roleSet.has('developer')) {
            return false
          }
        }
      }
      return true // 不允许的循环
    }

    if (visited.has(nodeId))
      return false

    visiting.add(nodeId)
    path.push({ nodeId, role: nodeRoleMap.get(nodeId)! })
    for (const next of adjacency.get(nodeId) || []) {
      if (dfs(next.to, path))
        return true
    }
    path.pop()
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }

  for (const nodeId of nodeIds) {
    if (dfs(nodeId))
      return true
  }

  return false
}

function parseTaskDefinitionUnsafe(content: string, filePath: string): TaskDefinition {
  const document = parseDocument(content)
  if (document.errors.length > 0) {
    throw new AppError(422, 'INVALID_TASK_YAML', 'Task YAML is invalid', {
      path: filePath,
      errors: document.errors.map(error => error.message),
    })
  }

  const raw = document.toJS()
  if (!isPlainObject(raw)) {
    throw new AppError(422, 'INVALID_TASK_YAML', 'Task YAML root must be an object', {
      path: filePath,
    })
  }

  const validationErrors: string[] = []
  const title = asOptionalString(raw.title) || asOptionalString(raw.name) || path.basename(filePath)
  const baseBranch = asOptionalString(raw.base_branch)
  const maxIterations = raw.max_iterations === undefined ? null : asPositiveInt(raw.max_iterations)
  if (raw.max_iterations !== undefined && maxIterations === null) {
    validationErrors.push('max_iterations must be a positive integer')
  }

  const rawNodes = raw.nodes
  const rawEdges = raw.edges

  if (!Array.isArray(rawNodes) || rawNodes.length === 0)
    validationErrors.push('nodes must be a non-empty array')

  if (!Array.isArray(rawEdges))
    validationErrors.push('edges must be an array')

  const nodes: TaskNode[] = []
  const nodeIds = new Set<string>()

  for (const node of Array.isArray(rawNodes) ? rawNodes : []) {
    if (!isPlainObject(node)) {
      validationErrors.push('each node must be an object')
      continue
    }

    const id = asOptionalString(node.id)
    const role = asOptionalString(node.role)
    const prompt = asOptionalString(node.prompt)
    const tools = Array.isArray(node.tools)
      ? node.tools.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())).map((item: string) => item.trim())
      : []

    if (!id) {
      validationErrors.push('each node must include a non-empty id')
      continue
    }

    if (nodeIds.has(id)) {
      validationErrors.push(`duplicate node id: ${id}`)
      continue
    }

    nodeIds.add(id)

    if (!role || !ALLOWED_ROLES.has(role)) {
      validationErrors.push(`node "${id}" must use one of the allowed roles: ${[...ALLOWED_ROLES].join(', ')}`)
      continue
    }

    nodes.push({
      id,
      role: role as TaskNode['role'],
      prompt,
      tools,
    })
  }

  const edges: TaskEdge[] = []
  for (const edge of Array.isArray(rawEdges) ? rawEdges : []) {
    if (!isPlainObject(edge)) {
      validationErrors.push('each edge must be an object')
      continue
    }

    const from = asOptionalString(edge.from)
    const to = asOptionalString(edge.to)
    const condition = asOptionalString(edge.condition)

    if (!from || !to) {
      validationErrors.push('each edge must include non-empty from and to')
      continue
    }

    if (!nodeIds.has(from) || (!nodeIds.has(to) && to !== TASK_END_NODE_ID)) {
      validationErrors.push(`edge "${from} -> ${to}" references unknown node ids`)
      continue
    }

    if (condition && !ALLOWED_EDGE_CONDITIONS.has(condition)) {
      validationErrors.push(`edge "${from} -> ${to}" uses unsupported condition "${condition}"`)
      continue
    }

    edges.push({
      from,
      to,
      condition,
    })
  }

  if (validationErrors.length === 0) {
    const incoming = new Set(edges.filter(edge => edge.to !== TASK_END_NODE_ID || nodeIds.has(TASK_END_NODE_ID)).map(edge => edge.to))
    const roots = nodes.filter(node => !incoming.has(node.id))
    if (roots.length !== 1) {
      validationErrors.push('task graph must have exactly one root node for the current executor')
    }
  }

  if (validationErrors.length === 0 && detectCycle(nodeIds, edges, nodes)) {
    validationErrors.push('task graph contains unsupported cycles; only reviewer -> developer loops are allowed')
  }

  const roles = [...new Set(nodes.map(node => node.role))]
  const definition: TaskDefinition = {
    path: filePath,
    title,
    baseBranch,
    maxIterations,
    nodes,
    edges,
    roles,
    hasHumanApproval: roles.includes('human_approval'),
    valid: validationErrors.length === 0,
    validationErrors,
    parseError: null,
  }

  return definition
}

export function tryParseTaskDefinition(content: string, filePath: string): TaskDefinition {
  try {
    const definition = parseTaskDefinitionUnsafe(content, filePath)
    return {
      ...definition,
      parseError: null,
    }
  }
  catch (error) {
    return {
      path: filePath,
      title: path.basename(filePath),
      baseBranch: null,
      maxIterations: null,
      nodes: [],
      edges: [],
      roles: [],
      hasHumanApproval: false,
      valid: false,
      validationErrors: error instanceof AppError
        ? (error.details?.errors as string[] || [error.message])
        : [error instanceof Error ? error.message : 'Unexpected parse error'],
      parseError: error instanceof AppError
        ? error.message
        : 'Unexpected parse error',
    }
  }
}

export function parseTaskDefinition(content: string, filePath: string): TaskDefinition {
  const definition = parseTaskDefinitionUnsafe(content, filePath)
  if (!definition.valid) {
    throw new AppError(422, 'INVALID_TASK_YAML', 'Task YAML failed validation', {
      path: filePath,
      errors: definition.validationErrors,
    })
  }
  return definition
}

export function toTaskSummary(definition: TaskDefinition): TaskSummary {
  return {
    path: definition.path,
    title: definition.title,
    baseBranch: definition.baseBranch,
    maxIterations: definition.maxIterations,
    hasHumanApproval: definition.hasHumanApproval,
    requireApproval: definition.hasHumanApproval,
    acceptance: null,
    executor: null,
    roles: definition.roles,
    nodeCount: definition.nodes.length,
    edgeCount: definition.edges.length,
    valid: definition.valid,
    parseError: definition.parseError,
    validationErrors: definition.validationErrors,
  }
}

export function toTaskSummaryV2(definition: TaskDefinitionV2): TaskSummary {
  return {
    path: definition.path,
    title: definition.title,
    baseBranch: definition.baseBranch,
    maxIterations: null, // V2 doesn't have maxIterations
    hasHumanApproval: definition.hasHumanApproval,
    requireApproval: definition.require_approval,
    acceptance: definition.acceptance,
    executor: definition.executor,
    roles: [], // V2 doesn't have explicit roles
    nodeCount: definition.nodeCount ?? 0,
    edgeCount: definition.edgeCount ?? 0,
    valid: definition.valid,
    parseError: definition.parseError,
    validationErrors: definition.validationErrors,
  }
}

// ============================================================================
// Task YAML v2 支持
// ============================================================================

function asPositiveIntWithDefault(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0)
    return value
  if (typeof value === 'string' && DIGITS_ONLY_RE.test(value.trim()))
    return Number.parseInt(value.trim(), 10)
  return defaultValue
}

function asOptionalPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0)
    return value
  if (typeof value === 'string' && DIGITS_ONLY_RE.test(value.trim()))
    return Number.parseInt(value.trim(), 10)
  return undefined
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean')
    return value
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return defaultValue
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim())
}

function detectTaskVersion(raw: Record<string, unknown>): 1 | 2 {
  // If it has nodes or edges, it's v1
  if (raw.nodes !== undefined || raw.edges !== undefined)
    return 1
  return 2
}

export function parseTaskDefinitionV2(content: string, filePath: string): TaskDefinitionV2 {
  const document = parseDocument(content)
  if (document.errors.length > 0) {
    return {
      path: filePath,
      title: path.basename(filePath),
      description: '',
      baseBranch: 'main',
      require_approval: false,
      acceptance: null,
      executor: null,
      valid: false,
      validationErrors: document.errors.map(e => e.message),
      parseError: 'Invalid YAML syntax',
      version: 2,
      hasHumanApproval: false,
      nodeCount: 0,
      edgeCount: 0,
    }
  }

  const raw = document.toJS()
  if (!isPlainObject(raw)) {
    return {
      path: filePath,
      title: path.basename(filePath),
      description: '',
      baseBranch: 'main',
      require_approval: false,
      acceptance: null,
      executor: null,
      valid: false,
      validationErrors: ['Task YAML root must be an object'],
      parseError: 'Invalid task format',
      version: 2,
      hasHumanApproval: false,
      nodeCount: 0,
      edgeCount: 0,
    }
  }

  // Detect version and migrate if needed
  const version = detectTaskVersion(raw)
  if (version === 1) {
    warn('[tasks] Deprecated v1 format detected, auto-migrating', { filePath })
    return migrateV1ToV2(raw, filePath)
  }

  // Parse v2 format
  const validationErrors: string[] = []

  const title = asOptionalString(raw.title) || asOptionalString(raw.name) || path.basename(filePath)
  const description = asOptionalString(raw.description) || asOptionalString(raw.prompt) || ''
  const baseBranch = asOptionalString(raw.base_branch) || 'main'
  const require_approval = asBoolean(raw.require_approval, false)

  // Parse acceptance config
  let acceptance: TaskDefinitionV2['acceptance'] = null
  if (isPlainObject(raw.acceptance)) {
    const commands = asStringArray(raw.acceptance.commands)
    const timeout = asPositiveIntWithDefault(raw.acceptance.timeout, 300000)
    const fail_fast = asBoolean(raw.acceptance.fail_fast, true)

    if (commands.length > 0) {
      acceptance = { commands, timeout, fail_fast }
    }
  }

  // Parse executor config
  let executor: TaskDefinitionV2['executor'] = null
  if (isPlainObject(raw.executor)) {
    const max_turns = asPositiveIntWithDefault(raw.executor.max_turns, 30)
    const execTimeout = asPositiveIntWithDefault(raw.executor.timeout, 1800000)
    const max_continuations = asOptionalPositiveInt(raw.executor.max_continuations)
    executor = { max_turns, timeout: execTimeout, ...(max_continuations ? { max_continuations } : {}) }
  }

  // Validation
  if (!title)
    validationErrors.push('title is required')
  if (!description && !raw.prompt)
    validationErrors.push('description or prompt is recommended')

  const valid = validationErrors.length === 0

  return {
    path: filePath,
    title,
    description,
    baseBranch,
    require_approval,
    acceptance,
    executor,
    valid,
    validationErrors,
    parseError: valid ? null : 'Validation failed',
    version: 2,
    hasHumanApproval: require_approval,
    nodeCount: 0,
    edgeCount: 0,
  }
}

function migrateV1ToV2(raw: Record<string, unknown>, filePath: string): TaskDefinitionV2 {
  // Parse as v1 first to get the structure
  const v1 = tryParseTaskDefinition(JSON.stringify(raw), filePath)

  // Collect prompts from developer nodes
  const developerPrompts: string[] = []
  for (const node of v1.nodes) {
    if (node.role === 'developer' && node.prompt) {
      developerPrompts.push(node.prompt)
    }
  }
  const description = developerPrompts.join('\n\n') || v1.title

  // Collect commands from tester nodes
  const commands: string[] = []
  for (const node of v1.nodes) {
    if (node.role === 'tester' && node.tools) {
      // Extract run commands from tools
      for (const tool of node.tools) {
        if (tool.startsWith('run:')) {
          commands.push(tool.slice(4).trim())
        }
      }
    }
  }

  const acceptance: TaskDefinitionV2['acceptance'] = commands.length > 0
    ? { commands, timeout: 300000, fail_fast: true }
    : null

  return {
    path: filePath,
    title: v1.title,
    description,
    baseBranch: v1.baseBranch || 'main',
    require_approval: v1.hasHumanApproval,
    acceptance,
    executor: null, // Use defaults
    valid: v1.valid,
    validationErrors: v1.validationErrors,
    parseError: v1.parseError,
    version: 2,
    hasHumanApproval: v1.hasHumanApproval,
    nodeCount: v1.nodes.length,
    edgeCount: v1.edges.length,
  }
}
