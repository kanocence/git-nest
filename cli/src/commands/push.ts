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
    name: 'push',
    description: 'Push the current branch to the Git Nest remote',
  },
  args: {
    remote: {
      type: 'string',
      description: 'Remote name',
      default: 'git-nest',
    },
    branch: {
      type: 'string',
      description: 'Branch to push (default: current branch)',
    },
    force: {
      type: 'boolean',
      description: 'Force push',
      default: false,
    },
  },
  async run({ args }) {
    const branch = args.branch || currentBranch()
    const gitArgs = ['push', args.remote, branch]
    if (args.force)
      gitArgs.push('--force')
    consola.start(`Pushing ${branch} → ${args.remote}...`)
    try {
      execFileSync('git', gitArgs, { stdio: 'inherit' })
    }
    catch {
      process.exit(1)
    }
  },
})
