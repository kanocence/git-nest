import { consola } from 'consola'
import { ofetch } from 'ofetch'
import { readConfig } from './config.ts'

export function createClient() {
  const config = readConfig()

  if (!config.server) {
    consola.error('No server configured. Run `git-nest login --server <url>` first.')
    process.exit(1)
  }

  const headers: Record<string, string> = {}
  if (config.sessionToken) {
    headers.cookie = `git-nest-session=${config.sessionToken}`
  }

  return ofetch.create({
    baseURL: config.server,
    headers,
    onResponseError({ response }) {
      if (response.status === 401) {
        consola.error('Authentication failed. Check your password with `git-nest login`.')
        process.exit(1)
      }
      if (response.status === 404) {
        consola.error('Resource not found.')
        process.exit(1)
      }
      if (response.status >= 500) {
        consola.error(`Server error (${response.status}). Check the Git Nest server logs.`)
        process.exit(1)
      }
    },
  })
}
