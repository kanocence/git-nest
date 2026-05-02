import { defineCommand } from 'citty'
import { consola } from 'consola'
import { createClient } from '../../api.ts'

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List all repositories on the Git Nest server',
  },
  async run() {
    const api = createClient()
    const data = await api<{ repos: { name: string }[], total: number }>('/api/repos')
    const repos = data.repos ?? []

    if (!repos.length) {
      consola.info('No repositories found.')
      return
    }

    consola.info(`${repos.length} repo${repos.length === 1 ? '' : 's'}:`)
    for (const repo of repos) {
      consola.log(`  ${repo.name}`)
    }
  },
})
