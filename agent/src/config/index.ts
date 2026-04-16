import type { Config } from '../types'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function envUrl(name: string): string {
  const raw = process.env[name]?.trim()
  if (!raw)
    return ''

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('invalid protocol')

    return url.toString()
  }
  catch {
    throw new Error(`${name} must be a valid http(s) URL.`)
  }
}
function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw)
    return defaultValue

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

export function loadConfig(): Config {
  const defaultRoot = path.join(process.cwd(), 'data')
  const dataDir = process.env.GIT_DATA_DIR || path.join(defaultRoot, 'git')
  const workspaceDir = process.env.GIT_WORKSPACE_DIR || path.join(defaultRoot, 'workspace')
  const stateDir = process.env.AGENT_STATE_DIR || path.join(os.tmpdir(), 'git-nest-agent-state')
  const apiSecret = process.env.API_SECRET || ''
  const allowInsecureNoAuth = process.env.ALLOW_INSECURE_NO_AUTH === '1'

  mkdirSync(stateDir, { recursive: true })

  if (!apiSecret && !allowInsecureNoAuth) {
    throw new Error('API_SECRET is required. Set ALLOW_INSECURE_NO_AUTH=1 only for local development.')
  }

  return {
    port: envInt('PORT', 3002),
    apiSecret,
    allowInsecureNoAuth,
    dataDir,
    workspaceDir,
    stateDir,
    dbPath: path.join(stateDir, 'state.sqlite'),
    gitTimeoutMs: envInt('GIT_TIMEOUT_MS', 30000),
    commandTimeoutMs: envInt('COMMAND_TIMEOUT_MS', 120000),
    agentGitUserName: process.env.AGENT_GIT_USER_NAME || 'Git Nest AI',
    agentGitUserEmail: process.env.AGENT_GIT_USER_EMAIL || 'ai@git-nest.local',
    webhookUrl: envUrl('WEBHOOK_URL'),
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    webhookTimeoutMs: envInt('WEBHOOK_TIMEOUT_MS', 30000),
    webhookMaxRetries: envInt('WEBHOOK_MAX_RETRIES', 3),
    // Executor configuration
    executorMaxTurns: envInt('AGENT_EXECUTOR_MAX_TURNS', 30),
    executorTimeoutMs: envInt('AGENT_EXECUTOR_TIMEOUT_MS', 30 * 60 * 1000), // 30 minutes
    executorMaxContinuations: envInt('AGENT_EXECUTOR_MAX_CONTINUATIONS', 2),
    // Goose model configuration (passed as CLI args and env vars)
    gooseProvider: process.env.GOOSE_PROVIDER || process.env.AGENT_MODEL_PROVIDER || 'openai',
    gooseModel: process.env.GOOSE_MODEL || process.env.AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
  }
}
