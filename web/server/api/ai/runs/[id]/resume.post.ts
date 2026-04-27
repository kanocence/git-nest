export default defineAgentHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run id is required' })
  }

  const body = await readBody(event)
  const rawResumeValue = body.resume ?? body.decision
  if (rawResumeValue === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'resume or decision is required',
      data: { code: 'RESUME_VALUE_REQUIRED' },
    })
  }

  const resumeValue = normalizeResumeValue(rawResumeValue)
  const agent = useAgentRuntime(event)
  await agent.runManager!.resumeRun(id, resumeValue)

  return {
    run: agent.db.runs.get(id),
    note: 'Run resume has been scheduled.',
  }
})

function normalizeResumeValue(value: string | boolean): 'approved' | 'rejected' {
  if (value === true || value === false)
    return value ? 'approved' : 'rejected'

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'approved' || normalized === 'approve')
      return 'approved'
    if (normalized === 'rejected' || normalized === 'reject')
      return 'rejected'
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'resume or decision must be approved/rejected or boolean',
    data: { code: 'INVALID_APPROVAL_DECISION' },
  })
}
