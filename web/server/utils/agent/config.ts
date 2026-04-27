import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

function envInt(raw: string | undefined, defaultValue: number): number {
  if (!raw)
    return defaultValue

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function envStr(raw: string | undefined, defaultValue: string = ''): string {
  return raw?.trim() || defaultValue
}

function envUrl(raw: string | undefined): string {
  if (!raw)
    return ''

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('invalid protocol')

    return url.toString()
  }
  catch {
    throw new Error(`URL must be a valid http(s) URL. Got: ${raw}`)
  }
}

function requireAbsoluteDir(name: string, raw: string | undefined): string {
  if (!raw)
    throw new Error(`${name} is required and must be an absolute path.`)
  if (!path.isAbsolute(raw))
    throw new Error(`${name} must be an absolute path. Got: ${raw}`)
  return raw
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
  const runtimeConfig = useRuntimeConfig().agent as Record<string, string | number | undefined>

  // Nuxt runtimeConfig only auto-maps NUXT_* prefixed env vars in production.
  // Fall back to process.env directly so that plain env names (e.g. GIT_DATA_DIR)
  // still work when passed by docker-compose.
  const config: Record<string, string | number | undefined> = { ...runtimeConfig }
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

  const dataDir = envStr(config.dataDir as string | undefined, path.join(process.cwd(), 'data', 'git'))
  const workspaceDir = envStr(config.workspaceDir as string | undefined, path.join(process.cwd(), 'data', 'workspace'))
  const stateDir = envStr(config.stateDir as string | undefined, path.join(os.tmpdir(), 'git-nest-agent-state'))

  mkdirSync(stateDir, { recursive: true })

  checkDockerAvailable()

  return {
    dataDir,
    workspaceDir,
    stateDir,
    dbPath: path.join(stateDir, 'state.sqlite'),
    gitTimeoutMs: envInt(config.gitTimeoutMs as string | undefined, 30000),
    commandTimeoutMs: envInt(config.commandTimeoutMs as string | undefined, 120000),
    agentGitUserName: envStr(config.agentGitUserName as string | undefined, 'Git Nest AI'),
    agentGitUserEmail: envStr(config.agentGitUserEmail as string | undefined, 'ai@git-nest.local'),
    webhookUrl: envUrl(config.webhookUrl as string | undefined),
    webhookSecret: envStr(config.webhookSecret as string | undefined, ''),
    webhookTimeoutMs: envInt(config.webhookTimeoutMs as string | undefined, 30000),
    webhookMaxRetries: envInt(config.webhookMaxRetries as string | undefined, 3),
    executorMaxTurns: envInt(config.executorMaxTurns as string | undefined, 30),
    executorTimeoutMs: envInt(config.executorTimeoutMs as string | undefined, 30 * 60 * 1000),
    executorMaxContinuations: envInt(config.executorMaxContinuations as string | undefined, 2),
    hermesImage: envStr(config.hermesImage as string | undefined, 'nousresearch/hermes-agent:latest'),
    hermesToolsets: envStr(config.hermesToolsets as string | undefined, 'file,terminal'),
    hermesProvider: envStr(config.hermesProvider as string | undefined, ''),
    hermesModel: envStr(config.hermesModel as string | undefined, ''),
    hermesHostWorkspaceDir: requireAbsoluteDir('HERMES_HOST_WORKSPACE_DIR', config.hermesHostWorkspaceDir as string | undefined),
    hermesHostStateDir: requireAbsoluteDir('HERMES_HOST_AGENT_STATE_DIR', config.hermesHostStateDir as string | undefined),
    hermesHostDataDir: requireAbsoluteDir('HERMES_HOST_DATA_DIR', config.hermesHostDataDir as string | undefined),
    runtimeUid: envStr(config.runtimeUid as string | undefined, '1000'),
    runtimeGid: envStr(config.runtimeGid as string | undefined, '1000'),
    dockerGid: envStr(config.dockerGid as string | undefined, ''),
  }
}
