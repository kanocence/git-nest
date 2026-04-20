import type { DbApi } from '../db'
import type { Config, RunRecord, RunStatus, TaskDefinitionV2 } from '../types'
import type { EventBus } from '../utils/events'
import type { HermesRunner, HermesRunParams, HermesRunResult } from './hermes-runner'
import { info, error as logError } from '../logger'
import { AppError } from '../utils/errors'
import { RUN_STATUS } from '../utils/status'
import { validateAcceptanceCommand } from './acceptance'
import { cleanupRunWorkspace, commitAndPushRunWorkspace, getRunWorkspacePath, hasRunWorkspaceChanges, readTaskFile, runRunWorkspaceCommand } from './git'
import { createHermesRunner } from './hermes-runner'
import { parseTaskDefinitionV2 } from './tasks'

export interface RunManager {
  startRun: (runId: string) => Promise<void>
  resumeRun: (runId: string, decision: 'approved' | 'rejected') => Promise<void>
  continueRun: (runId: string, decision: 'continue' | 'stop') => Promise<void>
  retryRun: (runId: string) => Promise<void>
  cancelRun: (runId: string) => boolean
  resumeQueuedRuns: () => void
}

interface ContinuationState {
  continuationsUsed: number
  reason: string
  summary: string
}

interface RunContext {
  run: RunRecord
  task: TaskDefinitionV2
  hermesRunner: HermesRunner
  abortController: AbortController
  continuation?: ContinuationState
}

export function createRunManager(
  config: Config,
  store: DbApi,
  bus: EventBus,
  hermesRunnerOverride?: HermesRunner,
): RunManager {
  const activeRuns = new Map<string, RunContext>()
  const hermesRunner = hermesRunnerOverride || createHermesRunner(config)

  function recordEvent(
    run: RunRecord,
    event: {
      type: string
      nodeId?: string | null
      role?: string | null
      message: string
      payload?: unknown
    },
  ) {
    const storedEvent = store.appendRunEvent({
      runId: run.id,
      type: event.type,
      nodeId: event.nodeId,
      role: event.role,
      message: event.message,
      payload: event.payload,
    })

    bus.publish({
      ...storedEvent,
      repo: run.repo,
      runId: run.id,
      taskBranch: run.task_branch,
      status: store.getRun(run.id)?.status || run.status,
    })

    return storedEvent
  }

  function updateLock(run: RunRecord, status: RunStatus): void {
    store.upsertRepoLock({
      repo: run.repo,
      runId: run.id,
      taskBranch: run.task_branch,
      status,
      lockedAt: store.getActiveRepoLock(run.repo)?.locked_at || run.created_at,
      updatedAt: new Date().toISOString(),
    })
  }

  function getMaxContinuations(task: TaskDefinitionV2): number {
    return task.executor?.max_continuations ?? config.executorMaxContinuations
  }

  function buildExecutorPrompt(task: TaskDefinitionV2, continuation?: ContinuationState): string {
    const basePrompt = task.description || `Execute task: ${task.title}`
    if (!continuation)
      return basePrompt

    return `${basePrompt}

You are continuing a previous attempt for this task.
Reason: ${continuation.reason}
Previous summary: ${continuation.summary || 'No summary was provided.'}

Continue from the current workspace state. Inspect existing changes first, do not revert unrelated work, and finish the remaining task as directly as possible.`
  }

  function parseContinuationState(runId: string, strict: boolean): ContinuationState {
    const approvalState = store.getApprovalState(runId)
    if (!approvalState) {
      if (strict) {
        throw new AppError(409, 'CONTINUATION_STATE_MISSING', 'Continuation state is missing; retry the run to rebuild continuation context')
      }

      return { continuationsUsed: 0, reason: 'Continuation state missing', summary: '' }
    }

    try {
      const parsed = JSON.parse(approvalState.prior_outputs) as Partial<ContinuationState>
      const continuationsUsed = parsed.continuationsUsed
      if (
        strict
        && (typeof continuationsUsed !== 'number' || !Number.isInteger(continuationsUsed) || continuationsUsed < 0)
      ) {
        throw new AppError(409, 'CONTINUATION_STATE_INVALID', 'Continuation state is invalid; retry the run to rebuild continuation context')
      }

      return {
        continuationsUsed: typeof continuationsUsed === 'number' ? continuationsUsed : 0,
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'Executor budget was exhausted',
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      }
    }
    catch (error) {
      if (error instanceof AppError)
        throw error

      if (strict) {
        throw new AppError(409, 'CONTINUATION_STATE_INVALID', 'Continuation state is invalid; retry the run to rebuild continuation context')
      }

      return { continuationsUsed: 0, reason: 'Continuation state could not be parsed', summary: '' }
    }
  }

  function pauseForContinuation(
    run: RunRecord,
    task: TaskDefinitionV2,
    result: HermesRunResult,
    continuationsUsed: number,
  ): boolean {
    const maxContinuations = getMaxContinuations(task)
    if (continuationsUsed >= maxContinuations)
      return false

    const reason = result.timedOut
      ? 'Hermes execution timeout was reached'
      : result.summary || 'Hermes executor requested continuation'
    const summary = result.summary || reason

    run = store.updateRunStatus(run.id, RUN_STATUS.waitingContinuation, summary)!
    updateLock(run, RUN_STATUS.waitingContinuation)
    store.createApprovalState({
      runId: run.id,
      nodeId: 'continuation',
      role: 'continuation_approval',
      question: `Continue task "${task.title}" with another executor budget?`,
      priorOutputs: {
        continuationsUsed,
        maxContinuations,
        reason,
        summary,
        exitCode: result.exitCode,
        rawLogPath: result.rawLogPath,
      },
    })

    recordEvent(run, {
      type: 'run.waiting_continuation',
      message: 'Executor budget was exhausted; waiting for continue or stop decision',
      payload: {
        continuationsUsed,
        maxContinuations,
        reason,
        summary,
        exitCode: result.exitCode,
      },
    })
    return true
  }

  async function runAcceptanceCommands(
    run: RunRecord,
    task: TaskDefinitionV2,
    abortSignal: AbortSignal,
  ): Promise<{ success: boolean, results: Array<{ command: string, ok: boolean, output: string }> }> {
    if (!task.acceptance?.commands || task.acceptance.commands.length === 0) {
      return { success: true, results: [] }
    }

    const results: Array<{ command: string, ok: boolean, output: string }> = []
    const timeout = task.acceptance.timeout || 300000
    const failFast = task.acceptance.fail_fast !== false

    recordEvent(run, {
      type: 'run.acceptance_started',
      message: `Starting ${task.acceptance.commands.length} acceptance command(s)`,
      payload: { commands: task.acceptance.commands },
    })

    for (const command of task.acceptance.commands) {
      if (abortSignal.aborted) {
        results.push({ command, ok: false, output: 'Cancelled' })
        if (failFast)
          break
        continue
      }

      recordEvent(run, {
        type: 'run.acceptance_command',
        message: `Running: ${command}`,
        payload: { command },
      })

      // Validate command against allowlist
      const validation = validateAcceptanceCommand(command)
      if (!validation.valid) {
        results.push({ command, ok: false, output: `Security: ${validation.reason}` })
        recordEvent(run, {
          type: 'run.acceptance_result',
          message: `Blocked: ${command}`,
          payload: { command, ok: false, reason: validation.reason },
        })
        if (failFast)
          break
        continue
      }

      const result = runRunWorkspaceCommand(
        config,
        run.repo,
        run.id,
        validation.executable,
        validation.args,
        timeout,
      )

      results.push({
        command,
        ok: result.ok,
        output: result.output.slice(0, 10000), // Limit output size
      })

      recordEvent(run, {
        type: 'run.acceptance_result',
        message: result.ok ? `Passed: ${command}` : `Failed: ${command}`,
        payload: { command, ok: result.ok, code: result.code },
      })

      if (!result.ok && failFast) {
        break
      }
    }

    const success = results.every(r => r.ok)

    recordEvent(run, {
      type: 'run.acceptance_completed',
      message: success ? 'All acceptance commands passed' : 'Some acceptance commands failed',
      payload: { results },
    })

    return { success, results }
  }

  async function commitChanges(run: RunRecord): Promise<{ commit: string, branch: string } | null> {
    if (!hasRunWorkspaceChanges(config, run.repo, run.id)) {
      return null
    }

    const message = `ai: ${run.task_title || run.task_path}`
    return commitAndPushRunWorkspace(config, run.repo, run.id, run.task_branch, message)
  }

  function loadTaskForRun(run: RunRecord): TaskDefinitionV2 {
    const content = readTaskFile(config, run.repo, run.source_ref, run.task_path)
    return parseTaskDefinitionV2(content, run.task_path)
  }

  async function finalizeApprovedRun(run: RunRecord, task: TaskDefinitionV2, abortSignal: AbortSignal) {
    recordEvent(run, {
      type: 'run.approval_resumed',
      message: 'Approval granted; running acceptance and commit',
    })

    const acceptanceResult = await runAcceptanceCommands(run, task, abortSignal)

    if (!acceptanceResult.success) {
      throw new AppError(500, 'ACCEPTANCE_FAILED', 'Acceptance commands failed')
    }

    const commitInfo = await commitChanges(run)

    run = store.updateRunStatus(run.id, RUN_STATUS.completed)!
    store.deleteRepoLock(run.repo)
    store.deleteApprovalState(run.id)

    try {
      cleanupRunWorkspace(config, run.repo, run.id)
    }
    catch (cleanupErr) {
      logError('[run-manager] workspace cleanup failed after approval', { runId: run.id, error: cleanupErr })
    }

    recordEvent(run, {
      type: 'run.completed',
      message: 'Run completed after approval',
      payload: {
        commitInfo,
        acceptanceResults: acceptanceResult.results,
      },
    })
  }

  async function processRun(runId: string, isRetry: boolean = false): Promise<void> {
    const context = activeRuns.get(runId)
    if (!context) {
      throw new AppError(500, 'RUN_CONTEXT_LOST', 'Run context was lost')
    }

    const { run: initialRun, task, hermesRunner, abortController, continuation } = context
    let run = initialRun

    // Run-level watchdog: fires 1 min after the executor's own timeout to force-abort
    // a stuck run that failed to respond to the abort signal.
    const runTimeoutMs = (task.executor?.timeout || config.executorTimeoutMs) + 60_000
    const runTimeoutId = setTimeout(() => {
      if (!abortController.signal.aborted) {
        logError('[run-manager] run-level watchdog timeout exceeded, forcing abort', { runId, runTimeoutMs })
        abortController.abort()
      }
    }, runTimeoutMs)

    try {
      // Update status to running
      run = store.updateRunStatus(runId, RUN_STATUS.running)!
      updateLock(run, RUN_STATUS.running)

      recordEvent(run, {
        type: continuation ? 'run.continuation_started' : isRetry ? 'run.retry' : 'run.started',
        message: continuation ? 'Run execution continued with another budget' : isRetry ? 'Run execution retried' : 'Run execution started',
        payload: {
          executor: 'hermes',
          task: task.title,
          maxTurns: task.executor?.max_turns || config.executorMaxTurns,
          timeoutMs: task.executor?.timeout || config.executorTimeoutMs,
          continuationsUsed: continuation?.continuationsUsed || 0,
          maxContinuations: getMaxContinuations(task),
        },
      })

      // Build runner params
      const runParams: HermesRunParams = {
        runId: run.id,
        repo: run.repo,
        workspacePath: getRunWorkspacePath(config, run.repo, run.id),
        prompt: buildExecutorPrompt(task, continuation),
        maxTurns: task.executor?.max_turns || config.executorMaxTurns,
        timeoutMs: task.executor?.timeout || config.executorTimeoutMs,
        toolsets: config.hermesToolsets,
        provider: config.hermesProvider,
        model: config.hermesModel,
      }

      // Execute with HermesRunner
      const finalResult = await hermesRunner.run(
        runParams,
        abortController.signal,
        (chunk: string) => {
          recordEvent(run, {
            type: 'run.executor_progress',
            message: chunk,
          })
        },
      )

      recordEvent(run, {
        type: 'run.executor_completed',
        message: `Hermes executor ${finalResult.status}`,
        payload: {
          status: finalResult.status,
          exitCode: finalResult.exitCode,
          timedOut: finalResult.timedOut,
          rawLogPath: finalResult.rawLogPath,
        },
      })

      if (finalResult.status !== 'completed') {
        if (finalResult.continuationEligible && pauseForContinuation(run, task, finalResult, continuation?.continuationsUsed || 0)) {
          return
        }

        const code = finalResult.status === 'cancelled' ? 'RUN_CANCELLED' : 'EXECUTOR_FAILED'
        const statusCode = finalResult.status === 'cancelled' ? 499 : 500
        throw new AppError(statusCode, code, finalResult.summary || `Hermes ${finalResult.status}`, {
          exitCode: finalResult.exitCode,
          rawLogPath: finalResult.rawLogPath,
        })
      }

      // Human approval gates the run before acceptance and before pushing changes.
      if (task.require_approval) {
        run = store.updateRunStatus(runId, RUN_STATUS.waitingApproval)!
        updateLock(run, RUN_STATUS.waitingApproval)

        store.createApprovalState({
          runId: run.id,
          nodeId: 'approval',
          role: 'human_approval',
          question: `Approve changes for task: ${task.title}?`,
          priorOutputs: { executorResult: finalResult },
        })

        recordEvent(run, {
          type: 'run.waiting_approval',
          message: 'Run is waiting for human approval before acceptance and commit',
          payload: { summary: finalResult.summary },
        })

        return
      }

      const acceptanceResult = await runAcceptanceCommands(run, task, abortController.signal)

      if (!acceptanceResult.success) {
        throw new AppError(500, 'ACCEPTANCE_FAILED', 'Acceptance commands failed')
      }

      const commitInfo = await commitChanges(run)

      // Mark as completed
      run = store.updateRunStatus(runId, RUN_STATUS.completed)!
      store.deleteRepoLock(run.repo)

      // Clean up run worktree - changes are committed and pushed
      try {
        cleanupRunWorkspace(config, run.repo, runId)
      }
      catch (cleanupErr) {
        logError('[run-manager] workspace cleanup failed after completion', { runId, error: cleanupErr })
      }

      recordEvent(run, {
        type: 'run.completed',
        message: finalResult.summary || 'Run completed successfully',
        payload: {
          commitInfo,
          acceptanceResults: acceptanceResult.results,
        },
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown execution error'
      const isCancelled = error instanceof AppError && error.code === 'RUN_CANCELLED'
      const isAcceptanceFailed = error instanceof AppError && error.code === 'ACCEPTANCE_FAILED'

      // Note: We do NOT commit on acceptance failure - changes stay in workspace for inspection

      if (isCancelled) {
        run = store.updateRunStatus(runId, RUN_STATUS.cancelled, message)!
        store.deleteRepoLock(run.repo)
        recordEvent(run, {
          type: 'run.cancelled',
          message,
          payload: { cancelled: true },
        })
      }
      else {
        run = store.updateRunStatus(runId, RUN_STATUS.failed, message)!
        store.deleteRepoLock(run.repo)
        recordEvent(run, {
          type: 'run.failed',
          message,
          payload: {
            details: error instanceof AppError ? error.details : null,
            acceptanceFailed: isAcceptanceFailed,
          },
        })
      }

      throw error
    }
    finally {
      clearTimeout(runTimeoutId)
      activeRuns.delete(runId)
    }
  }

  async function startRun(runId: string): Promise<void> {
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.queued && run.status !== RUN_STATUS.preparing) {
      throw new AppError(409, 'RUN_NOT_STARTABLE', 'Run is not in startable state', {
        runId,
        status: run.status,
      })
    }

    if (activeRuns.has(runId)) {
      throw new AppError(409, 'RUN_ALREADY_ACTIVE', 'Run is already being processed')
    }

    const task = loadTaskForRun(run)

    // Defensive check: validate task
    if (!task.valid) {
      const errorMessage = `Task validation failed: ${task.validationErrors.join(', ')}`
      store.updateRunStatus(runId, RUN_STATUS.failed, errorMessage)
      store.deleteRepoLock(run.repo)
      recordEvent(run, {
        type: 'run.failed',
        message: errorMessage,
        payload: { validationErrors: task.validationErrors, parseError: task.parseError },
      })
      throw new AppError(422, 'INVALID_TASK_YAML', errorMessage, {
        path: run.task_path,
        errors: task.validationErrors,
      })
    }

    // Create abort controller
    const abortController = new AbortController()

    // Set up context
    const context: RunContext = {
      run,
      task,
      hermesRunner,
      abortController,
    }

    activeRuns.set(runId, context)

    // Process in background
    processRun(runId).catch((error) => {
      logError('[run-manager] run execution failed', { runId, error })
    })
  }

  async function resumeRun(runId: string, decision: 'approved' | 'rejected'): Promise<void> {
    let run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.waitingApproval) {
      throw new AppError(409, 'RUN_NOT_WAITING_APPROVAL', 'Run is not waiting for approval')
    }

    const approvalState = store.getApprovalState(runId)
    if (!approvalState) {
      throw new AppError(409, 'APPROVAL_STATE_MISSING', 'Approval state is missing; retry the run to rebuild approval context')
    }

    recordEvent(run, {
      type: 'run.approval_decided',
      message: `Approval ${decision}`,
      payload: { decision },
    })

    if (decision === 'rejected') {
      store.deleteApprovalState(runId)
      run = store.updateRunStatus(runId, RUN_STATUS.failed, 'Rejected by human approval')!
      store.deleteRepoLock(run.repo)
      recordEvent(run, {
        type: 'run.rejected',
        message: 'Run rejected by human approval before acceptance and commit',
      })
      return
    }

    try {
      const task = loadTaskForRun(run)
      run = store.updateRunStatus(runId, RUN_STATUS.running)!
      updateLock(run, RUN_STATUS.running)
      await finalizeApprovedRun(run, task, new AbortController().signal)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      run = store.updateRunStatus(runId, RUN_STATUS.failed, message)!
      store.deleteRepoLock(run.repo)
      recordEvent(run, {
        type: 'run.failed',
        message: `Post-approval error: ${message}`,
        payload: { details: error instanceof AppError ? error.details : null },
      })
      throw error
    }
  }

  async function continueRun(runId: string, decision: 'continue' | 'stop'): Promise<void> {
    let run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.waitingContinuation) {
      throw new AppError(409, 'RUN_NOT_WAITING_CONTINUATION', 'Run is not waiting for continuation')
    }

    if (decision === 'continue' && activeRuns.has(runId)) {
      throw new AppError(409, 'RUN_ALREADY_ACTIVE', 'Run is already being processed')
    }

    const continuationState = parseContinuationState(runId, decision === 'continue')
    recordEvent(run, {
      type: 'run.continuation_decided',
      message: `Continuation ${decision}`,
      payload: { decision, ...continuationState },
    })

    if (decision === 'stop') {
      store.deleteApprovalState(runId)
      activeRuns.get(runId)?.abortController.abort()
      run = store.updateRunStatus(runId, RUN_STATUS.cancelled, 'Stopped by user after executor budget was exhausted')!
      store.deleteRepoLock(run.repo)
      recordEvent(run, {
        type: 'run.continuation_stopped',
        message: 'Run stopped after executor budget was exhausted',
      })
      return
    }

    const task = loadTaskForRun(run)
    const nextContinuation: ContinuationState = {
      ...continuationState,
      continuationsUsed: continuationState.continuationsUsed + 1,
    }

    const abortController = new AbortController()
    run = store.updateRunStatus(runId, RUN_STATUS.running)!
    updateLock(run, RUN_STATUS.running)

    activeRuns.set(runId, {
      run,
      task,
      hermesRunner,
      abortController,
      continuation: nextContinuation,
    })
    store.deleteApprovalState(runId)

    processRun(runId).catch((error) => {
      logError('[run-manager] continuation execution failed', { runId, error })
    })
  }

  async function retryRun(runId: string): Promise<void> {
    const run = store.getRun(runId)
    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found')
    }

    if (run.status !== RUN_STATUS.systemInterrupted) {
      throw new AppError(409, 'RUN_NOT_RETRYABLE', 'Only system_interrupted runs can be retried')
    }

    // Check if repo is locked by another run
    const existingLock = store.getActiveRepoLock(run.repo)
    if (existingLock && existingLock.run_id !== runId) {
      throw new AppError(409, 'REPO_BUSY', 'Repository is occupied by another active run', {
        activeRunId: existingLock.run_id,
      })
    }

    const task = loadTaskForRun(run)

    const abortController = new AbortController()

    const context: RunContext = {
      run,
      task,
      hermesRunner,
      abortController,
    }

    activeRuns.set(runId, context)

    processRun(runId, true).catch((error) => {
      logError('[run-manager] retry execution failed', { runId, error })
    })
  }

  function cancelRun(runId: string): boolean {
    const context = activeRuns.get(runId)
    if (!context) {
      return false
    }

    context.abortController.abort()
    info('[run-manager] run cancellation requested', { runId })
    return true
  }

  function resumeQueuedRuns(): void {
    const queuedRuns = store.listRunsByStatus(RUN_STATUS.queued)
    info('[run-manager] resuming queued runs', { count: queuedRuns.length })

    for (const run of queuedRuns) {
      startRun(run.id).catch((error) => {
        logError('[run-manager] failed to resume queued run', { runId: run.id, error })
      })
    }
  }

  return {
    startRun,
    resumeRun,
    continueRun,
    retryRun,
    cancelRun,
    resumeQueuedRuns,
  }
}
