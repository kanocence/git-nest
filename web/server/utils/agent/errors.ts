export class AgentError extends Error {
  statusCode: number
  code: string
  details: Record<string, unknown> | null

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> | null = null,
  ) {
    super(message)
    this.name = 'AgentError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError
}

export function toH3Error(error: AgentError) {
  return createError({
    statusCode: error.statusCode,
    statusMessage: error.message,
    data: {
      code: error.code,
      details: error.details,
    },
  })
}
