import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export interface AgentRuntimeConfig {
  dataDir: string
  workspaceDir: string
  stateDir: string
  dbPath: string
  gitTimeoutMs: number
  commandTimeoutMs: number
  agentGitUserName: string
  agentGitUserEmail: string
  webhookUrl: string
  webhookSecret: string
  webhookTimeoutMs: number
  webhookMaxRetries: number
  executorMaxTurns: number
  executorTimeoutMs: number
  executorMaxContinuations: number
  hermesImage: string
  hermesToolsets: string
  hermesProvider: string
  hermesModel: string
  hermesHostWorkspaceDir: string
  hermesHostStateDir: string
  hermesHostDataDir: string
  runtimeUid: string
  runtimeGid: string
  dockerGid: string
}

export function envInt(raw: unknown, defaultValue: number): number {
  if (raw === undefined || raw === null || raw === '')
    return defaultValue

  const parsed = Number.parseInt(String(raw).trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

export function envStr(raw: unknown, defaultValue: string = ''): string {
  if (raw === undefined || raw === null)
    return defaultValue

  return String(raw).trim() || defaultValue
}

function envUrl(raw: unknown): string {
  const value = envStr(raw)
  if (!value)
    return ''

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('invalid protocol')

    return url.toString()
  }
  catch {
    throw new Error(`URL must be a valid http(s) URL. Got: ${value}`)
  }
}

function requireAbsoluteDir(name: string, raw: unknown): string {
  const value = envStr(raw)
  if (!value)
    throw new Error(`${name} is required and must be an absolute path.`)
  if (!path.isAbsolute(value))
    throw new Error(`${name} must be an absolute path. Got: ${value}`)
  return value
}

export function checkDockerAvailable(): void {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 10000 })
  }
  catch (err: any) {
    const stderr = err.stderr?.toString() || ''
    if (stderr.includes('permission denied') || stderr.includes('Got permission denied')) {
      throw new Error('Docker socket permission denied. Ensure the user is in the docker group or set DOCKER_GID in your .env file.')
    }
    throw new Error('Docker is not available. Ensure docker is installed, the daemon is running, and the user has access permissions.')
  }
}

export function loadAgentConfig(): AgentRuntimeConfig {
  const runtimeConfig = useRuntimeConfig().agent as Record<string, unknown>

  // Nuxt runtimeConfig only auto-maps NUXT_* prefixed env vars in production.
  // Fall back to process.env directly so that plain env names (e.g. GIT_DATA_DIR)
  // still work when passed by docker-compose.
  const config: Record<string, unknown> = { ...runtimeConfig }
  const envFallbacks: Record<string, string> = {
    dataDir: 'GIT_DATA_DIR',
    workspaceDir: 'GIT_WORKSPACE_DIR',
    stateDir: 'AGENT_STATE_DIR',
    gitTimeoutMs: 'GIT_TIMEOUT_MS',
    commandTimeoutMs: 'COMMAND_TIMEOUT_MS',
    agentGitUserName: 'AGENT_GIT_USER_NAME',
    agentGitUserEmail: 'AGENT_GIT_USER_EMAIL',
    webhookUrl: 'WEBHOOK_URL',
    webhookSecret: 'WEBHOOK_SECRET',
    webhookTimeoutMs: 'WEBHOOK_TIMEOUT_MS',
    webhookMaxRetries: 'WEBHOOK_MAX_RETRIES',
    executorMaxTurns: 'AGENT_EXECUTOR_MAX_TURNS',
    executorTimeoutMs: 'AGENT_EXECUTOR_TIMEOUT_MS',
    executorMaxContinuations: 'AGENT_EXECUTOR_MAX_CONTINUATIONS',
    hermesImage: 'HERMES_IMAGE',
    hermesToolsets: 'HERMES_TOOLSETS',
    hermesProvider: 'HERMES_PROVIDER',
    hermesModel: 'HERMES_MODEL',
    hermesHostWorkspaceDir: 'HERMES_HOST_WORKSPACE_DIR',
    hermesHostStateDir: 'HERMES_HOST_AGENT_STATE_DIR',
    hermesHostDataDir: 'HERMES_HOST_DATA_DIR',
    runtimeUid: 'PUID',
    runtimeGid: 'PGID',
    dockerGid: 'DOCKER_GID',
  }
  for (const [key, envKey] of Object.entries(envFallbacks)) {
    if (!config[key] && process.env[envKey]) {
      config[key] = process.env[envKey]
    }
  }

  const dataDir = envStr(config.dataDir, path.join(process.cwd(), 'data', 'git'))
  const workspaceDir = envStr(config.workspaceDir, path.join(process.cwd(), 'data', 'workspace'))
  const stateDir = envStr(config.stateDir, path.join(os.tmpdir(), 'git-nest-agent-state'))

  mkdirSync(stateDir, { recursive: true })

  checkDockerAvailable()

  return {
    dataDir,
    workspaceDir,
    stateDir,
    dbPath: path.join(stateDir, 'state.sqlite'),
    gitTimeoutMs: envInt(config.gitTimeoutMs, 30000),
    commandTimeoutMs: envInt(config.commandTimeoutMs, 120000),
    agentGitUserName: envStr(config.agentGitUserName, 'Git Nest AI'),
    agentGitUserEmail: envStr(config.agentGitUserEmail, 'ai@git-nest.local'),
    webhookUrl: envUrl(config.webhookUrl),
    webhookSecret: envStr(config.webhookSecret, ''),
    webhookTimeoutMs: envInt(config.webhookTimeoutMs, 30000),
    webhookMaxRetries: envInt(config.webhookMaxRetries, 3),
    executorMaxTurns: envInt(config.executorMaxTurns, 30),
    executorTimeoutMs: envInt(config.executorTimeoutMs, 30 * 60 * 1000),
    executorMaxContinuations: envInt(config.executorMaxContinuations, 2),
    hermesImage: envStr(config.hermesImage, 'nousresearch/hermes-agent:latest'),
    hermesToolsets: envStr(config.hermesToolsets, 'file,terminal'),
    hermesProvider: envStr(config.hermesProvider, ''),
    hermesModel: envStr(config.hermesModel, ''),
    hermesHostWorkspaceDir: requireAbsoluteDir('HERMES_HOST_WORKSPACE_DIR', config.hermesHostWorkspaceDir),
    hermesHostStateDir: requireAbsoluteDir('HERMES_HOST_AGENT_STATE_DIR', config.hermesHostStateDir),
    hermesHostDataDir: requireAbsoluteDir('HERMES_HOST_DATA_DIR', config.hermesHostDataDir),
    runtimeUid: envStr(config.runtimeUid, '1000'),
    runtimeGid: envStr(config.runtimeGid, '1000'),
    dockerGid: envStr(config.dockerGid, ''),
  }
}
