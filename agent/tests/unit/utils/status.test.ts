import type { RunStatus } from '../../../src/types'
import { describe, expect, it } from 'vitest'
import { isLockedRunStatus, isTerminalRunStatus, RUN_STATUS } from '../../../src/utils/status'

describe('rUN_STATUS', () => {
  it('should contain all expected statuses', () => {
    expect(RUN_STATUS.queued).toBe('queued')
    expect(RUN_STATUS.preparing).toBe('preparing')
    expect(RUN_STATUS.running).toBe('running')
    expect(RUN_STATUS.waitingApproval).toBe('waiting_approval')
    expect(RUN_STATUS.completed).toBe('completed')
    expect(RUN_STATUS.failed).toBe('failed')
    expect(RUN_STATUS.cancelled).toBe('cancelled')
    expect(RUN_STATUS.systemInterrupted).toBe('system_interrupted')
  })
})

describe('isTerminalRunStatus', () => {
  const terminalStatuses: RunStatus[] = ['completed', 'failed', 'cancelled', 'system_interrupted']
  const nonTerminalStatuses: RunStatus[] = ['queued', 'preparing', 'running', 'waiting_approval']

  terminalStatuses.forEach((status) => {
    it(`should return true for terminal status: ${status}`, () => {
      expect(isTerminalRunStatus(status)).toBe(true)
    })
  })

  nonTerminalStatuses.forEach((status) => {
    it(`should return false for non-terminal status: ${status}`, () => {
      expect(isTerminalRunStatus(status)).toBe(false)
    })
  })
})

describe('isLockedRunStatus', () => {
  const lockedStatuses: RunStatus[] = ['queued', 'preparing', 'running', 'waiting_approval']
  const unlockedStatuses: RunStatus[] = ['completed', 'failed', 'cancelled', 'system_interrupted']

  lockedStatuses.forEach((status) => {
    it(`should return true for locked status: ${status}`, () => {
      expect(isLockedRunStatus(status)).toBe(true)
    })
  })

  unlockedStatuses.forEach((status) => {
    it(`should return false for unlocked status: ${status}`, () => {
      expect(isLockedRunStatus(status)).toBe(false)
    })
  })
})
