import { describe, expect, it } from 'vitest'
import { withRepoMutex } from '../../../src/utils/locks'

describe('withRepoMutex', () => {
  it('should execute function and return result', async () => {
    const result = await withRepoMutex('repo1', async () => 'success')
    expect(result).toBe('success')
  })

  it('should serialize calls for the same repo', async () => {
    const executionOrder: string[] = []

    const promise1 = withRepoMutex('repo1', async () => {
      executionOrder.push('start1')
      await new Promise(resolve => setTimeout(resolve, 50))
      executionOrder.push('end1')
      return 'result1'
    })

    const promise2 = withRepoMutex('repo1', async () => {
      executionOrder.push('start2')
      executionOrder.push('end2')
      return 'result2'
    })

    await Promise.all([promise1, promise2])

    expect(executionOrder).toEqual(['start1', 'end1', 'start2', 'end2'])
  })

  it('should allow parallel execution for different repos', async () => {
    const executionOrder: string[] = []

    const promise1 = withRepoMutex('repo1', async () => {
      executionOrder.push('start1')
      await new Promise(resolve => setTimeout(resolve, 50))
      executionOrder.push('end1')
      return 'result1'
    })

    const promise2 = withRepoMutex('repo2', async () => {
      executionOrder.push('start2')
      executionOrder.push('end2')
      return 'result2'
    })

    await Promise.all([promise1, promise2])

    // Both should start before either ends (parallel execution)
    expect(executionOrder.indexOf('start1')).toBeLessThan(executionOrder.indexOf('end1'))
    expect(executionOrder.indexOf('start2')).toBeLessThan(executionOrder.indexOf('end2'))
  })

  it('should propagate errors', async () => {
    await expect(
      withRepoMutex('repo1', async () => {
        throw new Error('Test error')
      }),
    ).rejects.toThrow('Test error')
  })

  it('should release lock after error', async () => {
    try {
      await withRepoMutex('repo1', async () => {
        throw new Error('Test error')
      })
    }
    catch {
      // Expected
    }

    // Should be able to acquire lock again
    const result = await withRepoMutex('repo1', async () => 'success')
    expect(result).toBe('success')
  })
})
