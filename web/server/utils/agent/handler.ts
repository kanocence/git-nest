import type { H3Event } from 'h3'
import { isAgentError, toH3Error } from './errors'

export function defineAgentHandler<T>(handler: (event: H3Event) => T | Promise<T>): (event: H3Event) => Promise<T> {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    }
    catch (error) {
      if (isAgentError(error)) {
        throw toH3Error(error)
      }

      // Preserve H3 errors (createError, validation failures, 404s, etc.)
      if (error && typeof error === 'object' && 'statusCode' in error && typeof (error as any).statusCode === 'number') {
        throw error
      }

      // Log unhandled error
      console.error('[agent] unhandled error', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Internal server error',
        data: {
          code: 'INTERNAL_ERROR',
        },
      })
    }
  })
}
