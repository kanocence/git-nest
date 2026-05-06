/**
 * POST /api/repos/import — clone remote repo into a hosted bare repo via SSE.
 */
import { validateRepoName } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string, remoteUrl?: string }>(event)
  const name = validateRepoName(body.name)
  const remoteUrl = typeof body.remoteUrl === 'string' ? body.remoteUrl.trim() : ''
  if (!remoteUrl) {
    throw createError({ statusCode: 400, statusMessage: 'remoteUrl is required' })
  }

  const config = useRuntimeConfig()
  const baseUrl = `http://${config.gitRunnerHost}:${config.gitRunnerPort}`

  await createSSEProxy({
    event,
    baseUrl,
    path: '/api/repos/import',
    gitRunnerSecret: config.gitRunnerSecret,
    body: { name, remoteUrl },
  })
})
