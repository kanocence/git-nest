/**
 * POST /api/repos/:name/clone — 代理 clone SSE 流
 */
import { validateRepoName } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const config = useRuntimeConfig()
  const baseUrl = `http://${config.gitRunnerHost}:${config.gitRunnerPort}`

  await createSSEProxy({
    event,
    baseUrl,
    path: `/api/repos/${name}/clone`,
    gitRunnerSecret: config.gitRunnerSecret,
  })
})
