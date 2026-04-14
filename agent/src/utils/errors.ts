export class AppError extends Error {
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
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
