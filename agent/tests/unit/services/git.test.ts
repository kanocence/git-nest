import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureRunWorkspace, validateRepoName } from '../../../src/services/git'
import { createTestConfig } from '../../helpers/factory'
import { cleanupTempDir, createTempDir } from '../../helpers/test-utils'

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
}

describe('validateRepoName', () => {
  it('should allow simple repository names', () => {
    expect(validateRepoName('demo')).toBe('demo')
    expect(validateRepoName('demo.repo-1')).toBe('demo.repo-1')
  })

  it('should reject path traversal and path separators', () => {
    expect(() => validateRepoName('../demo')).toThrow('Invalid repository name')
    expect(() => validateRepoName('demo/repo')).toThrow('Invalid repository name')
    expect(() => validateRepoName('demo\\repo')).toThrow('Invalid repository name')
  })
})

describe('ensureRunWorkspace', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir)
      cleanupTempDir(tempDir)
    tempDir = null
  })

  it('should create a run worktree from a bare repo with a local base branch', () => {
    tempDir = createTempDir('git-nest-run-workspace-')
    const dataDir = path.join(tempDir, 'git')
    const workspaceDir = path.join(tempDir, 'workspace')
    const stateDir = path.join(tempDir, 'state')
    const sourceDir = path.join(tempDir, 'source')
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(stateDir, { recursive: true })
    mkdirSync(path.join(sourceDir, '.git-nest', 'tasks'), { recursive: true })

    git(['init'], sourceDir)
    git(['config', 'user.email', 'test@example.com'], sourceDir)
    git(['config', 'user.name', 'Test User'], sourceDir)
    git(['config', 'core.autocrlf', 'false'], sourceDir)
    writeFileSync(path.join(sourceDir, 'README.md'), '# Test\n', 'utf8')
    writeFileSync(path.join(sourceDir, '.git-nest', 'tasks', 'task.yaml'), 'title: Test\nprompt: Test\n', 'utf8')
    git(['add', '.'], sourceDir)
    git(['commit', '-m', 'init'], sourceDir)
    git(['branch', '-M', 'main'], sourceDir)
    git(['clone', '--bare', sourceDir, path.join(dataDir, 'repo.git')])

    const config = createTestConfig({ dataDir, workspaceDir, stateDir })
    const workspace = ensureRunWorkspace(config, 'repo', 'run-1', 'main', 'ai/run-1')

    expect(existsSync(path.join(workspace, '.git'))).toBe(true)
    expect(git(['branch', '--show-current'], workspace)).toBe('ai/run-1')
    expect(existsSync(path.join(workspace, 'README.md'))).toBe(true)
  })
})
