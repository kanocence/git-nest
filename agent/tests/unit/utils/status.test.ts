import type { RunStatus } from '../../../src/types'
import { describe, expect, it } from 'vitest'
import { isLockedRunStatus, isTerminalRunStatus, RUN_STATUS } from '../../../src/utils/status'

const allStatuses = Object.values(RUN_STATUS)
const terminalStatuses: RunStatus[] = ['completed', 'failed', 'cancelled', 'system_interrupted']
const lockedStatuses: RunStatus[] = ['queued', 'preparing', 'running', 'waiting_approval', 'waiting_continuation']
const unlockedNonTerminalStatuses: RunStatus[] = []

describe('isTerminalRunStatus', () => {
  terminalStatuses.forEach((status) => {
    it(`should return true for terminal status: ${status}`, () => {
      expect(isTerminalRunStatus(status)).toBe(true)
    })
  })

  lockedStatuses.forEach((status) => {
    it(`should return false for non-terminal status: ${status}`, () => {
      expect(isTerminalRunStatus(status)).toBe(false)
    })
  })
})

describe('isLockedRunStatus', () => {
  lockedStatuses.forEach((status) => {
    it(`should return true for locked status: ${status}`, () => {
      expect(isLockedRunStatus(status)).toBe(true)
    })
  })

  terminalStatuses.forEach((status) => {
    it(`should return false for unlocked status: ${status}`, () => {
      expect(isLockedRunStatus(status)).toBe(false)
    })
  })
})

describe('run status classification', () => {
  it('should classify every known status exactly once', () => {
    for (const status of allStatuses) {
      const classifications = [
        isTerminalRunStatus(status),
        isLockedRunStatus(status),
        unlockedNonTerminalStatuses.includes(status),
      ].filter(Boolean)

      expect(classifications).toHaveLength(1)
    }
  })
})
