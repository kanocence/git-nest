import { execFileSync } from 'node:child_process'
import { defineCommand } from 'citty'
import { consola } from 'consola'

function currentBranch(): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  }
  catch {
    consola.error('Not in a Git repository.')
    return process.exit(1)
  }
}

export default defineCommand({
  meta: {
    name: 'pull',
    description: 'Pull the current branch from the Git Nest remote',
  },
  args: {
    remote: {
      type: 'string',
      description: 'Remote name',
      default: 'git-nest',
    },
    branch: {
      type: 'string',
      description: 'Branch to pull (default: current branch)',
    },
  },
  async run({ args }) {
    const branch = args.branch || currentBranch()
    consola.start(`Pulling ${args.remote}/${branch}...`)
    try {
      execFileSync('git', ['pull', args.remote, branch], { stdio: 'inherit' })
    }
    catch {
      process.exit(1)
    }
  },
})
