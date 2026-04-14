export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Run id is required',
    })
  }

  const body = await readBody(event)
  return await proxyToAgent(`/api/runs/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    body,
  })
})
