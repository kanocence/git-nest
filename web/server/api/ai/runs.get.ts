export default defineEventHandler(async () => {
  return await proxyToAgent('/api/runs')
})
