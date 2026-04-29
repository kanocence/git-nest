/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') && path.extname(specifier) === '') {
      try {
        return nextResolve(`${specifier}.ts`, context)
      }
      catch {
        return nextResolve(specifier, context)
      }
    }
    return nextResolve(specifier, context)
  },
})

const { ensureRunWorkspace, listTaskFiles } = await import('./git.ts')

function createBareRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'git-nest-git-test-'))
  const worktree = path.join(dir, 'work')
  const bare = path.join(dir, 'repo.git')

  execFileSync('git', ['init', worktree], { stdio: 'ignore' })
  execFileSync('git', ['-C', worktree, 'config', 'user.name', 'Test'], { stdio: 'ignore' })
  execFileSync('git', ['-C', worktree, 'config', 'user.email', 'test@example.local'], { stdio: 'ignore' })

  mkdirSync(path.join(worktree, '.git-nest', 'tasks'), { recursive: true })
  writeFileSync(path.join(worktree, '.git-nest', 'tasks', 'sample.yaml'), 'version: 2\ntitle: Sample\n')
  execFileSync('git', ['-C', worktree, 'add', '.'], { stdio: 'ignore' })
  execFileSync('git', ['-C', worktree, 'commit', '-m', 'seed'], { stdio: 'ignore' })
  const branch = execFileSync('git', ['-C', worktree, 'branch', '--show-current'], { encoding: 'utf8' }).trim()
  execFileSync('git', ['clone', '--bare', worktree, bare], { stdio: 'ignore' })

  return { dir, bare, branch }
}

test('listTaskFiles rejects an empty ref with a 400 AgentError', () => {
  const repo = createBareRepo()
  try {
    const config = { dataDir: repo.dir, gitTimeoutMs: 5000 }

    assert.throws(
      () => listTaskFiles(config, 'repo', ''),
      error => error?.statusCode === 400 && error?.code === 'INVALID_REF',
    )
  }
  finally {
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

test('ensureRunWorkspace creates executable cleanup-git-branches helper', () => {
  const repo = createBareRepo()
  try {
    const config = {
      dataDir: repo.dir,
      workspaceDir: path.join(repo.dir, 'workspace'),
      gitTimeoutMs: 10000,
    }
    const workspace = ensureRunWorkspace(config, 'repo', 'run-1', repo.branch, 'ai/run-1')
    const script = path.join(workspace, '.git-nest', 'cleanup-git-branches.sh')

    assert.equal(existsSync(script), true)
    assert.match(readFileSync(script, 'utf8'), /git fetch "\$REMOTE" --prune/)
    if (process.platform !== 'win32')
      assert.notEqual(statSync(script).mode & 0o111, 0)
  }
  finally {
    rmSync(repo.dir, { recursive: true, force: true })
  }
})
