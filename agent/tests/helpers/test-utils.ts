import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 创建临时目录
 */
export function createTempDir(prefix = 'git-nest-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * 清理临时目录
 */
export function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  }
  catch {
    // Ignore cleanup errors
  }
}

/**
 * 等待条件满足
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return
    }
    await sleep(intervalMs)
  }

  throw new Error(`waitFor timeout after ${timeoutMs}ms`)
}

/**
 * 睡眠
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 模拟时间
 */
export function freezeTime(fixedTime: Date): () => void {
  const originalDate = Date

  globalThis.Date = class extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixedTime)
      }
      else {
        super(...args as [string | number | Date])
      }
    }

    static now(): number {
      return fixedTime.getTime()
    }
  } as DateConstructor

  return () => {
    globalThis.Date = originalDate
  }
}
