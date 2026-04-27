import { createAgentDb } from '../utils/agent/db'
import { createAgentEventHub } from '../utils/agent/events'
import { createAgentLocks } from '../utils/agent/locks'
import { loadAgentConfig } from '../utils/agent/config'
import { createRunManager } from '../utils/agent/run-manager'
import type { AgentRuntime } from '../utils/agent/runtime'

export default defineNitroPlugin((nitroApp) => {
  // Check for existing runtime (Dev HMR reuse)
  const existing = (globalThis as any).__gitNestAgentRuntime as AgentRuntime | undefined
  if (existing) {
    try {
      // Verify db connection is still usable
      existing.db.db.prepare('SELECT 1').get()
      console.log('[agent] Reusing existing AgentRuntime (Dev HMR)')
      return
    }
    catch {
      console.log('[agent] Existing AgentRuntime db connection stale, recreating...')
    }
  }

  const config = loadAgentConfig()
  const db = createAgentDb(config.dbPath)
  const events = createAgentEventHub()
  const locks = createAgentLocks()
  const runManager = createRunManager(config, db, events)

  const runtime: AgentRuntime = {
    config,
    db,
    events,
    locks,
    runManager,
  }

  ;(globalThis as any).__gitNestAgentRuntime = runtime

  console.log('[agent] AgentRuntime initialized')

  // Recover interrupted locks from previous sessions (crash/restart)
  runManager.recoverInterruptedRuns()

  // Resume queued runs from previous sessions
  runManager.resumeQueuedRuns()

  // Graceful shutdown: abort active runs on Nitro close
  nitroApp.hooks.hook('close', () => {
    console.log('[agent] Nitro shutting down, aborting active runs...')
    runManager.abortActiveRuns('Nitro server shutting down')
  })
})
