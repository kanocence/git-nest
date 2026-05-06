/**
 * Mock middleware — intercepts GET requests and returns fixture data.
 *
 * Enable:   MOCK=true  in your .env (or environment).
 * Disable:  remove / unset MOCK  (or set to anything other than "true").
 *
 * Only GET (read / display) endpoints are mocked.
 * Mutation endpoints (POST, DELETE, etc.) are not intercepted and will
 * fall through to whatever handler exists (typically returning 503 when
 * the agent runtime is unavailable).
 *
 * This file is safe to ship in production builds — it exits immediately
 * when MOCK is not "true".
 */
import {
  MOCK_BRANCHES,
  MOCK_LOGS,
  MOCK_REPOS,
  MOCK_RUN_EVENTS,
  MOCK_RUNS,
  MOCK_TASKS,
  MOCK_WORKSPACES,
} from '../mock/data'

// Helper: match /api/repos/:name/…
const RE_REPO_NAME = /^\/api\/repos\/([^/]+)(\/.*)?$/
// Helper: match /api/ai/runs/:id  (not a further sub-path)
const RE_RUN_ID = /^\/api\/ai\/runs\/([^/]+)$/

export default defineEventHandler((event) => {
  // ── Guard: only active when MOCK=true ──────────────────────────────────────
  // eslint-disable-next-line node/prefer-global/process
  if (process.env.MOCK !== 'true')
    return

  // ── Guard: only intercept GET requests ────────────────────────────────────
  if (getMethod(event) !== 'GET')
    return

  const url = getRequestURL(event)
  const path = url.pathname
  const query = url.searchParams

  // ── /api/auth/status ──────────────────────────────────────────────────────
  if (path === '/api/auth/status') {
    return { authenticated: true, required: false }
  }

  // ── /api/repos  (list all) ────────────────────────────────────────────────
  if (path === '/api/repos') {
    return MOCK_REPOS
  }

  // ── /api/repos/:name/…  ───────────────────────────────────────────────────
  const repoMatch = RE_REPO_NAME.exec(path)
  if (repoMatch) {
    const name = repoMatch[1]!
    const rest = repoMatch[2] ?? ''

    if (rest === '/branches') {
      return (MOCK_BRANCHES as Record<string, object>)[name] ?? { repo: name, branches: [] }
    }

    if (rest === '/log') {
      return (MOCK_LOGS as Record<string, object>)[name] ?? { repo: name, branch: 'main', total: 0, commits: [] }
    }

    if (rest === '/workspace') {
      return (MOCK_WORKSPACES as Record<string, object>)[name] ?? {
        repo: name,
        path: '',
        exists: false,
        isGitRepo: false,
        clean: null,
        currentBranch: null,
        currentCommit: null,
        occupiedByAi: false,
        activeRunId: null,
        activeTaskBranch: null,
        lockStatus: null,
        lockUpdatedAt: null,
      }
    }

    if (rest === '/ai/tasks') {
      return (MOCK_TASKS as Record<string, object>)[name] ?? { repo: name, ref: 'main', tasks: [], total: 0 }
    }

    if (rest === '/ai/workspace') {
      return (MOCK_WORKSPACES as Record<string, object>)[name] ?? {
        repo: name,
        path: '',
        exists: false,
        isGitRepo: false,
        clean: null,
        currentBranch: null,
        currentCommit: null,
        occupiedByAi: false,
        activeRunId: null,
        activeTaskBranch: null,
        lockStatus: null,
        lockUpdatedAt: null,
      }
    }
  }

  // ── /api/ai/runs  (list, with pagination + filter) ────────────────────────
  if (path === '/api/ai/runs') {
    const limit = Math.min(Math.max(Number(query.get('limit')) || 20, 1), 100)
    const offset = Math.max(Number(query.get('offset')) || 0, 0)
    const statusParam = query.get('status') ?? ''
    const repoParam = query.get('repo') ?? ''

    // status param can be a single value or comma-separated list
    const statusSet = statusParam ? new Set(statusParam.split(',').map(s => s.trim()).filter(Boolean)) : null
    const repoFilter = repoParam.trim() || null

    let filtered = MOCK_RUNS.filter((r) => {
      if (statusSet && !statusSet.has(r.status))
        return false
      if (repoFilter && r.repo !== repoFilter)
        return false
      return true
    })

    const total = filtered.length
    filtered = filtered.slice(offset, offset + limit)

    return { runs: filtered, total, limit, offset }
  }

  // ── /api/ai/runs/:id  (detail) ────────────────────────────────────────────
  const runMatch = RE_RUN_ID.exec(path)
  if (runMatch) {
    const id = runMatch[1]!
    const run = MOCK_RUNS.find(r => r.id === id)
    if (!run) {
      throw createError({ statusCode: 404, statusMessage: 'Run not found' })
    }
    const events = (MOCK_RUN_EVENTS as Record<string, object[]>)[id] ?? []
    const workspace = (MOCK_WORKSPACES as Record<string, object>)[run.repo] ?? {
      repo: run.repo,
      path: '',
      exists: false,
      isGitRepo: false,
      clean: null,
      currentBranch: null,
      currentCommit: null,
      occupiedByAi: false,
      activeRunId: null,
      activeTaskBranch: null,
      lockStatus: null,
      lockUpdatedAt: null,
    }
    return { run, events, workspace }
  }

  // ── /api/backups ──────────────────────────────────────────────────────────
  if (path === '/api/backups') {
    return { backups: [], total: 0 }
  }

  // No match — fall through to actual route handler
})
