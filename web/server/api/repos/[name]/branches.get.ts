/**
 * GET /api/repos/:name/branches — 获取仓库分支列表
 */
import { validateRepoName } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const config = useRuntimeConfig()
  const baseUrl = `http://${config.gitRunnerHost}:${config.gitRunnerPort}`

  const response = await $fetch(`${baseUrl}/api/repos/${name}/branches`, {
    headers: {
      'Authorization': `Bearer ${config.gitRunnerSecret}`,
    },
  })

  return response
})
