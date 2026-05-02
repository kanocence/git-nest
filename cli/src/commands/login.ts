import { defineCommand } from 'citty'
import { consola } from 'consola'
import { hashPassword, readConfig, writeConfig } from '../config.ts'

export default defineCommand({
  meta: {
    name: 'login',
    description: 'Configure the Git Nest server URL and password',
  },
  args: {
    server: {
      type: 'string',
      description: 'Server URL, e.g. http://myserver:3000',
    },
    password: {
      type: 'string',
      description: 'WEB_PASSWORD set on the server (leave empty if no password is configured)',
    },
  },
  async run({ args }) {
    const current = readConfig()
    const server = args.server || current.server
    // If --password was explicitly passed, hash it (or clear if empty string).
    // If --password was omitted entirely, keep the existing token.
    const sessionToken = args.password !== undefined
      ? (args.password ? hashPassword(args.password) : undefined)
      : current.sessionToken

    if (!server) {
      consola.error('Provide --server <url>')
      process.exit(1)
    }

    writeConfig({ server, sessionToken })
    consola.success(`Server saved: ${server}`)
    if (sessionToken) {
      consola.success('Password hashed and saved (plain text is not stored).')
    }
    else {
      consola.info('No password set — server will be accessed without authentication.')
    }
  },
})
