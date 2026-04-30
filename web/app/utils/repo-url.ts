export function inferRepoNameFromRemoteUrl(remoteUrl: string): string {
  const trimmed = remoteUrl.trim().replace(/\/+$/, '')
  if (!trimmed)
    return ''

  let path = ''
  if (trimmed.includes('://')) {
    try {
      path = new URL(trimmed).pathname.replace(/\/+$/, '')
    }
    catch {
      return ''
    }
  }
  else if (trimmed.includes(':')) {
    path = trimmed.slice(trimmed.lastIndexOf(':') + 1).replace(/\/+$/, '')
  }
  else {
    path = trimmed.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') || ''
  }

  const lastSegment = path.slice(path.lastIndexOf('/') + 1)
  return lastSegment.replace(/\.git$/i, '')
}
