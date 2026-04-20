import type { RunStatus } from '../types'

export const RUN_STATUS: Record<string, RunStatus> = {
  queued: 'queued',
  preparing: 'preparing',
  running: 'running',
  waitingApproval: 'waiting_approval',
  waitingContinuation: 'waiting_continuation',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  systemInterrupted: 'system_interrupted',
}

export const TERMINAL_RUN_STATUSES: Set<RunStatus> = new Set([
  RUN_STATUS.completed,
  RUN_STATUS.failed,
  RUN_STATUS.cancelled,
  RUN_STATUS.systemInterrupted,
])

export const LOCKED_RUN_STATUSES: Set<RunStatus> = new Set([
  RUN_STATUS.queued,
  RUN_STATUS.preparing,
  RUN_STATUS.running,
  RUN_STATUS.waitingApproval,
  RUN_STATUS.waitingContinuation,
])

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status)
}

export function isLockedRunStatus(status: RunStatus): boolean {
  return LOCKED_RUN_STATUSES.has(status)
}
