export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'default'

/**
 * Format a datetime string to zh-CN locale with seconds precision.
 * Suitable for event timestamps and detail views.
 */
export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Format a datetime string to zh-CN locale with minute precision.
 * Suitable for list views.
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format the duration between two ISO timestamps as a human-readable string.
 * Pass `endOverride` to use a custom end time (e.g. live-updating active runs).
 */
export function formatDuration(createdAt: string, updatedAt: string, endOverride?: Date): string {
  const end = endOverride ?? new Date(updatedAt)
  const diff = end.getTime() - new Date(createdAt).getTime()
  if (diff < 0)
    return ''
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0)
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  if (hours > 0)
    return `${hours}h ${minutes % 60}m`
  if (minutes > 0)
    return `${minutes}m`
  return `${seconds}s`
}

/**
 * Format a timeout budget in milliseconds to a human-readable string.
 */
export function formatDurationMs(ms: number): string {
  const minutes = Math.round(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0)
    return `${days}d ${hours % 24}h`
  if (hours > 0)
    return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

/**
 * Map a run-status string to a visual tone for StatusBadge.
 */
export function getStatusTone(status: string): StatusTone {
  switch (status) {
    case 'completed': return 'success'
    case 'failed':
    case 'system_interrupted': return 'danger'
    case 'waiting_approval':
    case 'waiting_continuation': return 'warning'
    case 'running':
    case 'queued':
    case 'preparing': return 'info'
    default: return 'default'
  }
}
