import { execFileSync } from 'node:child_process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { readConfig } from '../config.ts'

export default defineCommand({
  meta: {
    name: 'status',
    description: 'Show Git Nest server config and local remote binding',
  },
  async run() {
    const config = readConfig()

    consola.info(`Server : ${config.server ?? '(not set — run: git-nest login)'}`)

    consola.info(`Auth   : ${config.sessionToken ? 'password configured' : 'no password'}`)

    // Detect git-nest remote in the current repo
    try {
      const remotes = execFileSync('git', ['remote', '-v'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const lines = remotes
        .split('\n')
        .filter((l: string) => {
          if (l.includes('git-nest'))
            return true
          try {
            return config.server ? l.includes(new URL(config.server).hostname) : false
          }
          catch {
            return false
          }
        })
        .filter(Boolean)

      if (lines.length) {
        consola.info(`Remote : ${lines[0].trim()}`)
      }
      else {
        consola.info('Remote : (none — run `git-nest remote add <repo>` to bind this directory)')
      }
    }
    catch {
      consola.info('Remote : (not in a Git repository)')
    }
  },
})
