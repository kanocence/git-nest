export interface TaskTemplate {
  id: string
  label: string
  description: string
  acceptanceCommands: string[]
  requireApproval: boolean
  executor: {
    max_turns: number
    timeout: number
    max_continuations: number
  }
}

export interface TaskCreateInput {
  templateId?: string
  title?: string
  description?: string
  baseBranch?: string
  requireApproval?: boolean
  acceptanceCommands?: string[]
  acceptanceTimeout?: number
  acceptanceFailFast?: boolean
  executorMaxTurns?: number
  executorTimeout?: number
  executorMaxContinuations?: number
  fileName?: string
}

const DEFAULT_EXECUTOR = {
  max_turns: 30,
  timeout: 1800000,
  max_continuations: 2,
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'bugfix',
    label: 'Bug Fix',
    description: 'Fix a defect and verify the regression path.',
    acceptanceCommands: ['pnpm lint', 'pnpm typecheck'],
    requireApproval: true,
    executor: { ...DEFAULT_EXECUTOR },
  },
  {
    id: 'feature',
    label: 'Feature',
    description: 'Implement a product or application feature.',
    acceptanceCommands: ['pnpm lint', 'pnpm typecheck'],
    requireApproval: true,
    executor: { max_turns: 40, timeout: 2400000, max_continuations: 2 },
  },
  {
    id: 'refactor',
    label: 'Refactor',
    description: 'Improve structure while preserving behavior.',
    acceptanceCommands: ['pnpm lint', 'pnpm typecheck'],
    requireApproval: true,
    executor: { ...DEFAULT_EXECUTOR },
  },
  {
    id: 'ui-polish',
    label: 'UI Polish',
    description: 'Improve frontend layout, states, or styling.',
    acceptanceCommands: ['pnpm lint', 'pnpm typecheck'],
    requireApproval: true,
    executor: { ...DEFAULT_EXECUTOR },
  },
  {
    id: 'docs',
    label: 'Docs',
    description: 'Update documentation or examples.',
    acceptanceCommands: ['pnpm lint'],
    requireApproval: false,
    executor: { max_turns: 20, timeout: 1200000, max_continuations: 1 },
  },
  {
    id: 'investigation',
    label: 'Investigation',
    description: 'Analyze a problem and report findings without making broad changes.',
    acceptanceCommands: [],
    requireApproval: false,
    executor: { max_turns: 20, timeout: 1200000, max_continuations: 1 },
  },
]
