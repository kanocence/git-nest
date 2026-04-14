export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Run id is required',
    })
  }

  return await proxyToAgent(`/api/runs/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  })
})
