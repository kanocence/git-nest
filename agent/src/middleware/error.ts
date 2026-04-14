import type { Context } from 'hono'
import { error as logError } from '../logger'
import { isAppError } from '../utils/errors'

export function errorHandler(err: Error, c: Context) {
  if (isAppError(err)) {
    return c.json({
      error: err.message,
      code: err.code,
      details: err.details || undefined,
    }, err.statusCode as any)
  }

  logError('[agent] unhandled error', err)
  return c.json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  }, 500)
}
