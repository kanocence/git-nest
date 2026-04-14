/**
 * GET /api/repos/:name/branches — 获取仓库分支列表
 */
import { validateRepoName } from '../../../utils/validation'

interface BranchInfo {
  name: string
  commit: string
  isDefault: boolean
}

interface BranchesResponse {
  repo: string
  branches: BranchInfo[]
}

export default defineEventHandler(async (event): Promise<BranchesResponse> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const config = useRuntimeConfig()
  const baseUrl = `http://${config.gitRunnerHost}:${config.gitRunnerPort}`

  const response = await $fetch<BranchesResponse>(`${baseUrl}/api/repos/${name}/branches`, {
    headers: {
      Authorization: `Bearer ${config.gitRunnerSecret}`,
    },
  })

  return response
})
