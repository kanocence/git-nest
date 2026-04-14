import type { Context, Next } from 'hono'
import type { Config } from '../types'

export function createAuthMiddleware(config: Config) {
  return async (c: Context, next: Next) => {
    if (c.req.path === '/health')
      return next()

    if (!config.apiSecret)
      return next()

    const auth = c.req.header('authorization') || ''
    if (!auth.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' }, 401)
    }

    if (auth.slice('Bearer '.length) !== config.apiSecret) {
      return c.json({ error: 'Invalid API secret', code: 'FORBIDDEN' }, 403)
    }

    return next()
  }
}
