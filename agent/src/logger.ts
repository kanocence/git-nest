import { createConsola } from 'consola'

export const logger = createConsola({
  level: process.env.LOG_LEVEL === 'debug'
    ? 4
    : process.env.LOG_LEVEL === 'warn'
      ? 2
      : process.env.LOG_LEVEL === 'error'
        ? 1
        : 3, // default: info
  formatOptions: {
    date: true,
    colors: true,
  },
})

export function debug(message: string, ...args: unknown[]) {
  return logger.debug(message, ...args)
}

export function info(message: string, ...args: unknown[]) {
  return logger.info(message, ...args)
}

export function warn(message: string, ...args: unknown[]) {
  return logger.warn(message, ...args)
}

export function error(message: string, ...args: unknown[]) {
  return logger.error(message, ...args)
}
