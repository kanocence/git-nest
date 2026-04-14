import type { Config } from '../../types'
import type { CodingExecutor } from './types'
import { createGooseExecutor } from './goose'

export * from './types'

export function createExecutor(config: Config): CodingExecutor {
  return createGooseExecutor(config.stateDir)
}
