import type { RunRecord, RunStatus } from '#shared/types/agent'
import { RUN_STATUS, APPROVAL_RUN_STATUSES, CONTINUATION_RUN_STATUSES, TERMINAL_RUN_STATUSES } from '#shared/types/agent-status'
import { AgentError } from './errors'

export function assertRunCanApprove(run: RunRecord): void {
  if (!APPROVAL_RUN_STATUSES.has(run.status)) {
    throw new AgentError(
      409,
      'RUN_NOT_WAITING_APPROVAL',
      `Run is not waiting for approval (current status: ${run.status})`,
      { runId: run.id, status: run.status },
    )
  }
}

export function assertRunCanContinue(run: RunRecord): void {
  if (!CONTINUATION_RUN_STATUSES.has(run.status)) {
    throw new AgentError(
      409,
      'RUN_NOT_WAITING_CONTINUATION',
      `Run is not waiting for continuation (current status: ${run.status})`,
      { runId: run.id, status: run.status },
    )
  }
}

export function assertRunCanRelease(run: RunRecord): void {
  // Release is allowed for terminal statuses and any locked status
  // (running/waiting states can be released by cancelling first)
  if (!isTerminalRunStatus(run.status) && !isLockedRunStatus(run.status)) {
    throw new AgentError(
      409,
      'RUN_NOT_RELEASABLE',
      `Run cannot be released in current status: ${run.status}`,
      { runId: run.id, status: run.status },
    )
  }
}

export function assertRunCanRetry(run: RunRecord): void {
  if (!isRetryableRunStatus(run.status)) {
    throw new AgentError(
      409,
      'RUN_NOT_RETRYABLE',
      `Run is not in a retryable status (current status: ${run.status})`,
      { runId: run.id, status: run.status },
    )
  }
}

function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status)
}

function isLockedRunStatus(status: RunStatus): boolean {
  return status !== RUN_STATUS.completed
    && status !== RUN_STATUS.failed
    && status !== RUN_STATUS.cancelled
    && status !== RUN_STATUS.systemInterrupted
}

function isRetryableRunStatus(status: RunStatus): boolean {
  return status === RUN_STATUS.failed || status === RUN_STATUS.cancelled || status === RUN_STATUS.systemInterrupted
}
