import type { Config, RepoLock, WorkspaceInfo, WorkspaceSnapshot } from '../types'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppError } from '../utils/errors'

const REPO_NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/
const NEWLINE_RE = /\r?\n/

export function validateRepoName(name: string): string {
  if (!name || !REPO_NAME_RE.test(name))
    throw new AppError(400, 'INVALID_REPO_NAME', 'Invalid repository name')
  return name
}

export function bareRepoPath(config: Config, repo: string): string {
  return path.join(config.dataDir, `${repo}.git`)
}

export function workspacePath(config: Config, repo: string): string {
  return path.join(config.workspaceDir, repo)
}

interface RunGitOptions {
  cwd?: string
  timeoutMs?: number
}

function runGit(args: string[], options: RunGitOptions = {}): string {
  const invocation = process.platform === 'win32'
    ? {
        command: 'powershell.exe',
        args: [
          '-NoProfile',
          '-Command',
          `$ErrorActionPreference='Stop'; & git @(${args.map(arg => `'${String(arg).replace(/'/g, '\'\'\'')}'`).join(', ')})`,
        ],
      }
    : {
        command: 'git',
        args,
      }

  try {
    return execFileSync(invocation.command, invocation.args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim()
  }
  catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString('utf8').trim()
    const stdout = (error as { stdout?: Buffer }).stdout?.toString('utf8').trim()
    const detail = stderr || stdout || (error instanceof Error ? error.message : '')
    throw new AppError(500, 'GIT_COMMAND_FAILED', `git ${args.join(' ')} failed`, {
      detail,
    })
  }
}

interface RunProgramResult {
  ok: boolean
  code: number
  output: string
}

function runProgram(command: string, args: string[] = [], options: RunGitOptions = {}): RunProgramResult {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    return {
      ok: true,
      code: 0,
      output: stdout.trim(),
    }
  }
  catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString('utf8').trim()
    const stdout = (error as { stdout?: Buffer }).stdout?.toString('utf8').trim()
    return {
      ok: false,
      code: typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 1,
      output: [stdout, stderr].filter(Boolean).join('\n').trim() || (error instanceof Error ? error.message : ''),
    }
  }
}

export function ensureRepoExists(config: Config, repo: string): string {
  const barePath = bareRepoPath(config, repo)
  if (!existsSync(barePath))
    throw new AppError(404, 'REPO_NOT_FOUND', 'Repository not found')
  return barePath
}

export function getDefaultRef(config: Config, repo: string): string {
  const barePath = ensureRepoExists(config, repo)
  const head = readFileSync(path.join(barePath, 'HEAD'), 'utf8').trim()
  if (head.startsWith('ref: refs/heads/'))
    return head.slice('ref: refs/heads/'.length)
  return 'HEAD'
}

export function listTaskFiles(config: Config, repo: string, ref: string): string[] {
  const barePath = ensureRepoExists(config, repo)
  const output = runGit([
    '--git-dir',
    barePath,
    'ls-tree',
    '-r',
    '--name-only',
    ref,
    '--',
    '.git-nest/tasks',
  ], { timeoutMs: config.gitTimeoutMs })

  if (!output)
    return []

  return output
    .split(NEWLINE_RE)
    .map(item => item.trim())
    .filter(item => item.endsWith('.yaml') || item.endsWith('.yml'))
}

export function readTaskFile(config: Config, repo: string, ref: string, filePath: string): string {
  const barePath = ensureRepoExists(config, repo)
  return runGit([
    '--git-dir',
    barePath,
    'show',
    `${ref}:${filePath}`,
  ], { timeoutMs: config.gitTimeoutMs })
}

export function getWorkspaceInfo(config: Config, repo: string, lock: RepoLock | null = null): WorkspaceInfo {
  const dir = workspacePath(config, repo)
  const exists = existsSync(dir)

  if (!exists) {
    return {
      repo,
      path: dir,
      exists: false,
      isGitRepo: false,
      clean: null,
      currentBranch: null,
      currentCommit: null,
      occupiedByAi: Boolean(lock),
      activeRunId: lock?.run_id || null,
      activeTaskBranch: lock?.task_branch || null,
    }
  }

  const gitDir = path.join(dir, '.git')
  const isGitRepo = existsSync(gitDir)

  if (!isGitRepo) {
    return {
      repo,
      path: dir,
      exists: true,
      isGitRepo: false,
      clean: null,
      currentBranch: null,
      currentCommit: null,
      occupiedByAi: Boolean(lock),
      activeRunId: lock?.run_id || null,
      activeTaskBranch: lock?.task_branch || null,
    }
  }

  const status = runGit(['-C', dir, 'status', '--porcelain'], { timeoutMs: config.gitTimeoutMs })
  const currentBranch = runGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: config.gitTimeoutMs })
  const currentCommit = runGit(['-C', dir, 'rev-parse', '--short', 'HEAD'], { timeoutMs: config.gitTimeoutMs })

  return {
    repo,
    path: dir,
    exists: true,
    isGitRepo: true,
    clean: status.length === 0,
    currentBranch,
    currentCommit,
    occupiedByAi: Boolean(lock),
    activeRunId: lock?.run_id || null,
    activeTaskBranch: lock?.task_branch || null,
  }
}

export function createRunId(): string {
  return crypto.randomUUID()
}

// Run-level workspace functions
export function getRunWorkspacePath(config: Config, repo: string, runId: string): string {
  return path.join(config.workspaceDir, repo, 'runs', runId)
}

function resolveWorktreeBaseRef(config: Config, barePath: string, baseBranch: string): string {
  const candidates = [`origin/${baseBranch}`, baseBranch]
  for (const candidate of candidates) {
    try {
      runGit(['--git-dir', barePath, 'rev-parse', '--verify', candidate], { timeoutMs: config.gitTimeoutMs })
      return candidate
    }
    catch {
      // Try the next common ref form.
    }
  }
  throw new AppError(404, 'BASE_REF_NOT_FOUND', 'Base branch was not found in repository', {
    baseBranch,
    candidates,
  })
}

export function ensureRunWorkspace(config: Config, repo: string, runId: string, baseBranch: string, taskBranch: string): string {
  const barePath = ensureRepoExists(config, repo)
  const workspaceDir = getRunWorkspacePath(config, repo, runId)
  const parentDir = path.dirname(workspaceDir)
  mkdirSync(parentDir, { recursive: true })

  const isNewWorktree = !existsSync(workspaceDir)

  if (isNewWorktree) {
    const baseRef = resolveWorktreeBaseRef(config, barePath, baseBranch)
    runGit(['-C', barePath, 'worktree', 'add', '-B', taskBranch, workspaceDir, baseRef], { timeoutMs: config.gitTimeoutMs * 4 })
  }

  const gitDir = path.join(workspaceDir, '.git')
  if (!existsSync(gitDir)) {
    throw new AppError(409, 'WORKSPACE_INVALID', 'Run workspace exists but is not a git repository')
  }

  // Configure origin remote for push if not exists (only for new worktree)
  if (isNewWorktree) {
    try {
      runGit(['-C', workspaceDir, 'remote', 'get-url', 'origin'], { timeoutMs: config.gitTimeoutMs })
    }
    catch {
      // origin not configured, add it
      runGit(['-C', workspaceDir, 'remote', 'add', 'origin', barePath], { timeoutMs: config.gitTimeoutMs })
    }
  }

  return workspaceDir
}

export function getRunWorkspaceSnapshot(config: Config, repo: string, runId: string): WorkspaceSnapshot {
  const dir = getRunWorkspacePath(config, repo, runId)
  const status = runGit(['-C', dir, 'status', '--short'], { timeoutMs: config.gitTimeoutMs })
  const diffStat = runGit(['-C', dir, 'diff', '--stat'], { timeoutMs: config.gitTimeoutMs })
  const trackedFiles = runGit(['-C', dir, 'ls-files'], { timeoutMs: config.gitTimeoutMs })
  const currentBranch = runGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: config.gitTimeoutMs })
  const currentCommit = runGit(['-C', dir, 'rev-parse', '--short', 'HEAD'], { timeoutMs: config.gitTimeoutMs })

  return {
    status,
    diffStat,
    currentBranch,
    currentCommit,
    trackedFiles: trackedFiles
      .split(NEWLINE_RE)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 200),
  }
}

export function hasRunWorkspaceChanges(config: Config, repo: string, runId: string): boolean {
  const dir = getRunWorkspacePath(config, repo, runId)
  const status = runGit(['-C', dir, 'status', '--short'], { timeoutMs: config.gitTimeoutMs })
  return status.length > 0
}

export function applyRunWorkspacePatch(config: Config, repo: string, runId: string, patchText: string): void {
  const dir = getRunWorkspacePath(config, repo, runId)
  const tempPath = path.join(os.tmpdir(), `git-nest-${runId}-${crypto.randomUUID()}.patch`)
  writeFileSync(tempPath, patchText, 'utf8')

  try {
    runGit(['-C', dir, 'apply', '--whitespace=nowarn', tempPath], { timeoutMs: config.gitTimeoutMs * 2 })
  }
  finally {
    try {
      unlinkSync(tempPath)
    }
    catch {
      // ignore temp cleanup issues
    }
  }
}

export function runRunWorkspaceCommand(
  config: Config,
  repo: string,
  runId: string,
  command: string,
  args: string[] = [],
  timeoutMs: number = config.commandTimeoutMs,
): RunProgramResult {
  return runProgram(command, args, {
    cwd: getRunWorkspacePath(config, repo, runId),
    timeoutMs,
  })
}

export function commitAndPushRunWorkspace(
  config: Config,
  repo: string,
  runId: string,
  branch: string,
  message: string,
): { commit: string, branch: string } | null {
  const dir = getRunWorkspacePath(config, repo, runId)

  runGit(['-C', dir, 'config', 'user.name', config.agentGitUserName], { timeoutMs: config.gitTimeoutMs })
  runGit(['-C', dir, 'config', 'user.email', config.agentGitUserEmail], { timeoutMs: config.gitTimeoutMs })
  runGit(['-C', dir, 'add', '-A'], { timeoutMs: config.gitTimeoutMs })

  const staged = runGit(['-C', dir, 'diff', '--cached', '--shortstat'], { timeoutMs: config.gitTimeoutMs })
  if (!staged)
    return null

  runGit(['-C', dir, 'commit', '-m', message], { timeoutMs: config.gitTimeoutMs * 2 })
  runGit(['-C', dir, 'push', '-u', 'origin', branch], { timeoutMs: config.gitTimeoutMs * 4 })

  return {
    commit: runGit(['-C', dir, 'rev-parse', '--short', 'HEAD'], { timeoutMs: config.gitTimeoutMs }),
    branch,
  }
}

export function cleanupRunWorkspace(config: Config, repo: string, runId: string): void {
  const workspaceDir = getRunWorkspacePath(config, repo, runId)
  const barePath = bareRepoPath(config, repo)

  if (existsSync(workspaceDir)) {
    try {
      // Remove worktree reference from bare repo
      runGit(['-C', barePath, 'worktree', 'remove', workspaceDir], { timeoutMs: config.gitTimeoutMs })
    }
    catch {
      // If worktree remove fails, force remove the directory
      try {
        runGit(['-C', barePath, 'worktree', 'prune'], { timeoutMs: config.gitTimeoutMs })
      }
      catch {
        // ignore
      }
    }
  }
}
