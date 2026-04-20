import type { DbApi } from './db'
import type { RunManager } from './services/run-manager'
import type { Config } from './types'
import type { EventBus } from './utils/events'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { loadConfig } from './config'
import { createDb } from './db'
import { info, warn } from './logger'
import { createAuthMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/error'
import { setupRoutes } from './routes'
import { createRunManager } from './services/run-manager'
import { createEventBus } from './utils/events'
import { isTerminalRunStatus, RUN_STATUS } from './utils/status'

interface AppContext {
  Variables: {
    config: Config
    store: DbApi
    bus: EventBus
    runManager: RunManager
  }
}

const app = new Hono<AppContext>()

app.use(honoLogger())
app.use(cors())

const config = loadConfig()
const store = createDb(config.dbPath)
const bus = createEventBus()
const runManager = createRunManager(config, store, bus)

app.use(createAuthMiddleware(config))
app.onError(errorHandler)

setupRoutes(app, config, store, bus, runManager)

recoverInterruptedRuns()

runManager.resumeQueuedRuns()

function recoverInterruptedRuns() {
  const recovered: Array<{ repo: string, runId: string, action: string }> = []

  for (const lock of store.listRepoLocks()) {
    const run = store.getRun(lock.run_id)

    if (!run) {
      store.deleteRepoLock(lock.repo)
      recovered.push({ repo: lock.repo, runId: lock.run_id, action: 'cleared_orphan_lock' })
      continue
    }

    if (run.status === RUN_STATUS.queued)
      continue

    if (run.status === RUN_STATUS.waitingApproval || run.status === RUN_STATUS.waitingContinuation) {
      // Approval/continuation states are recoverable when their persisted state exists.
      const approvalState = store.getApprovalState(run.id)
      if (approvalState) {
        recovered.push({ repo: run.repo, runId: run.id, action: `${run.status}_with_state_preserved` })
      }
      else {
        store.updateRunStatus(
          run.id,
          RUN_STATUS.systemInterrupted,
          `Run was ${run.status} but persisted state was lost. Please use retry to restart.`,
        )
        store.deleteRepoLock(lock.repo)
        recovered.push({ repo: run.repo, runId: run.id, action: `${run.status}_to_interrupted` })
      }
      continue
    }

    if (isTerminalRunStatus(run.status)) {
      store.deleteRepoLock(lock.repo)
      recovered.push({ repo: lock.repo, runId: run.id, action: 'cleared_terminal_lock' })
      continue
    }

    store.updateRunStatus(
      run.id,
      RUN_STATUS.systemInterrupted,
      'Run interrupted by orchestrator restart before reaching a recoverable state',
    )
    store.deleteRepoLock(lock.repo)
    recovered.push({ repo: run.repo, runId: run.id, action: 'marked_system_interrupted' })
  }

  if (recovered.length > 0) {
    warn('[agent] recovered interrupted runs', recovered)
  }
}

info(`[agent] listening on :${config.port}`)
serve({
  fetch: app.fetch,
  port: config.port,
})
