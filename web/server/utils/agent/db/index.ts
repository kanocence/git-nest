import { createRequire } from 'node:module'
import type { DatabaseSync } from 'node:sqlite'
import { initSchema } from './schema'
import { createStatements } from './statements'
import {
  createApprovalStateRepository,
  createCheckpointRepository,
  createCodeReviewRepository,
  createEventRepository,
  createLockRepository,
  createRunRepository,
  createRunWorkspaceRepository,
} from './repository'
import type {
  ApprovalStateRepository,
  CheckpointRepository,
  CodeReviewRepository,
  EventRepository,
  LockRepository,
  RunRepository,
  RunWorkspaceRepository,
} from './repository'

const require = createRequire(import.meta.url)
const { DatabaseSync: DatabaseSyncClass } = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync }

export interface AgentDb {
  db: DatabaseSync
  runs: RunRepository
  events: EventRepository
  locks: LockRepository
  codeReviews: CodeReviewRepository
  runWorkspaces: RunWorkspaceRepository
  approvalStates: ApprovalStateRepository
  checkpoints: CheckpointRepository
}

export function createAgentDb(dbPath: string): AgentDb {
  const db = new DatabaseSyncClass(dbPath)
  initSchema(db)

  const statements = createStatements(db)

  return {
    db,
    runs: createRunRepository(db, statements),
    events: createEventRepository(db, statements),
    locks: createLockRepository(db, statements),
    codeReviews: createCodeReviewRepository(db, statements),
    runWorkspaces: createRunWorkspaceRepository(db, statements),
    approvalStates: createApprovalStateRepository(db, statements),
    checkpoints: createCheckpointRepository(db, statements),
  }
}
