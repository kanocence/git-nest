import { execFileSync } from 'node:child_process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { readConfig } from '../../config.ts'

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add the Git Nest server as a remote for the current repository',
  },
  args: {
    repo: {
      type: 'positional',
      required: true,
      description: 'Repository name on Git Nest',
    },
    name: {
      type: 'string',
      description: 'Local remote name',
      default: 'git-nest',
    },
    ssh: {
      type: 'string',
      description: 'SSH host override (default: inferred from server URL)',
    },
  },
  async run({ args }) {
    const config = readConfig()
    if (!config.server) {
      consola.error('No server configured. Run `git-nest login` first.')
      process.exit(1)
    }

    let sshHost: string
    if (args.ssh) {
      sshHost = args.ssh
    }
    else {
      try {
        sshHost = new URL(config.server!).hostname
      }
      catch {
        consola.error('Saved server URL is invalid. Run `git-nest login --server <url>` again.')
        process.exit(1)
      }
    }
    const remoteUrl = `git@${sshHost}:/data/git/${args.repo}.git`

    try {
      execFileSync('git', ['remote', 'add', args.name, remoteUrl], { stdio: 'inherit' })
      consola.success(`Remote '${args.name}' → ${remoteUrl}`)
    }
    catch {
      consola.error('Failed. Are you in a Git repository, and does this remote already exist?')
      process.exit(1)
    }
  },
})
