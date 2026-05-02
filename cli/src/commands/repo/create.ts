import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { readConfig } from '../../config.ts'
import { createClient } from '../../api.ts'

export default defineCommand({
  meta: {
    name: 'create',
    description: 'Create a bare repository on Git Nest',
  },
  args: {
    name: {
      type: 'positional',
      required: true,
      description: 'Repository name',
    },
    clone: {
      type: 'string',
      description: 'Import from this remote URL (streams git clone progress)',
    },
  },
  async run({ args }) {
    if (!args.clone) {
      // Simple bare repo creation
      const api = createClient()
      await api('/api/repos', { method: 'POST', body: { name: args.name } })
      consola.success(`Repository '${args.name}' created.`)
      return
    }

    // Clone import — consume the SSE stream from /api/repos/import
    const config = readConfig()
    if (!config.server) {
      consola.error('No server configured. Run `git-nest login --server <url>` first.')
      process.exit(1)
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.sessionToken) {
      headers.cookie = `git-nest-session=${config.sessionToken}`
    }

    consola.start(`Importing '${args.name}' from ${args.clone} ...`)

    let response: Response
    try {
      response = await fetch(`${config.server}/api/repos/import`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: args.name, remoteUrl: args.clone }),
      })
    }
    catch (err: any) {
      consola.error(`Network error: ${err.message}`)
      process.exit(1)
    }

    if (!response.ok || !response.body) {
      consola.error(`Server returned ${response.status}`)
      process.exit(1)
    }

    // Parse SSE lines and print progress
    const rl = createInterface({ input: Readable.fromWeb(response.body as any), crlfDelay: Infinity })
    let success = false
    for await (const line of rl) {
      if (!line.startsWith('data: '))
        continue
      const payload = line.slice(6).trim()
      if (payload === '' || payload === '[DONE]')
        continue
      try {
        const evt = JSON.parse(payload) as { type?: string, message?: string, error?: string, exitCode?: number }
        if (evt.type === 'error') {
          consola.error(`Clone failed: ${evt.message ?? 'unknown error'}`)
          process.exit(1)
        }
        if (evt.type === 'done') {
          if (evt.exitCode !== 0) {
            consola.error(`Clone failed with exit code ${evt.exitCode}`)
            process.exit(1)
          }
          success = true
          break
        }
        if (evt.message) {
          consola.log(`  ${evt.message}`)
        }
      }
      catch {
        // non-JSON data line, ignore
      }
    }

    if (success) {
      consola.success(`Repository '${args.name}' imported successfully.`)
    }
    else {
      consola.error('Clone stream ended without a successful completion event.')
      process.exit(1)
    }
  },
})
