import type { DbApi } from '../../src/db'
import { createDb } from '../../src/db'

/**
 * 创建内存测试数据库
 */
export function createTestDb(): DbApi {
  return createDb(':memory:')
}

/**
 * 重置测试数据库（清空所有数据但保留 schema）
 */
export function resetTestDb(db: DbApi): void {
  db.db.exec(`
    DELETE FROM code_reviews;
    DELETE FROM run_events;
    DELETE FROM repo_locks;
    DELETE FROM runs;
  `)
}

/**
 * 关闭测试数据库连接
 */
export function closeTestDb(db: DbApi): void {
  db.db.close()
}
