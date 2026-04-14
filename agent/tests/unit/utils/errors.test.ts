import { describe, expect, it } from 'vitest'
import { AppError, isAppError } from '../../../src/utils/errors'

describe('appError', () => {
  it('should create an AppError with all properties', () => {
    const error = new AppError(404, 'NOT_FOUND', 'Resource not found', { id: '123' })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(error.name).toBe('AppError')
    expect(error.statusCode).toBe(404)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('Resource not found')
    expect(error.details).toEqual({ id: '123' })
  })

  it('should create an AppError without details', () => {
    const error = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong')

    expect(error.details).toBeNull()
  })

  it('should be catchable as Error', () => {
    const error = new AppError(400, 'BAD_REQUEST', 'Invalid input')

    try {
      throw error
    }
    catch (e) {
      expect(e).toBe(error)
      expect(e instanceof Error).toBe(true)
    }
  })
})

describe('isAppError', () => {
  it('should return true for AppError instances', () => {
    const error = new AppError(404, 'NOT_FOUND', 'Not found')
    expect(isAppError(error)).toBe(true)
  })

  it('should return false for regular Error', () => {
    const error = new Error('Regular error')
    expect(isAppError(error)).toBe(false)
  })

  it('should return false for null', () => {
    expect(isAppError(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(isAppError(undefined)).toBe(false)
  })

  it('should return false for plain object', () => {
    expect(isAppError({ statusCode: 404, code: 'NOT_FOUND' })).toBe(false)
  })
})
