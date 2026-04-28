import { cleanupRunWorkspace } from '../../../utils/agent/git'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'system_interrupted'])

export default defineAgentHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Run id is required',
      data: { code: 'RUN_ID_REQUIRED' },
    })
  }

  const agent = useAgentRuntime(event)
  const run = agent.db.runs.get(id)
  if (!run) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Run not found',
      data: { code: 'RUN_NOT_FOUND' },
    })
  }

  if (!TERMINAL_STATUSES.has(run.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Only terminal runs can be deleted',
      data: { code: 'RUN_NOT_TERMINAL', status: run.status },
    })
  }

  try {
    cleanupRunWorkspace(agent.config, run.repo, run.id)
  }
  catch (error) {
    console.error('[routes] cleanup before run delete failed:', error)
  }

  const deleted = agent.db.runs.delete(id)
  if (!deleted) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Run could not be deleted',
      data: { code: 'RUN_DELETE_FAILED' },
    })
  }

  return { id, deleted: true }
})
