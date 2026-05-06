import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface GitNestConfig {
  server?: string
  /**
   * Pre-computed sha256(password) stored as the session cookie value.
   * The plain-text password is never persisted to disk.
   */
  sessionToken?: string
}

const configDir = join(homedir(), '.git-nest')
const configPath = join(configDir, 'config.json')

export function readConfig(): GitNestConfig {
  if (!existsSync(configPath))
    return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as GitNestConfig
  }
  catch {
    return {}
  }
}

export function writeConfig(patch: Partial<GitNestConfig>): void {
  const current = readConfig()
  const next = { ...current, ...patch }
  if (!existsSync(configDir))
    mkdirSync(configDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8')
}

/** Hash a plain-text password into the session token expected by the server. */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}
