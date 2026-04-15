export default defineEventHandler(async (event): Promise<unknown> => {
  const name = validateRepoName(getRouterParam(event, 'name'))
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const baseUrl = `http://${config.gitRunnerHost}:${config.gitRunnerPort}`

  return await $fetch<unknown>(`${baseUrl}/api/repos/${name}/branches/delete`, {
    method: 'POST',
    body,
    headers: {
      Authorization: `Bearer ${config.gitRunnerSecret}`,
    },
  })
})
