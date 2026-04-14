const repoMutexes = new Map<string, Promise<void>>()

export async function withRepoMutex<T>(repo: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoMutexes.get(repo) || Promise.resolve()
  let release: () => void

  const current = new Promise<void>((resolve) => {
    release = resolve
  })

  const chain = previous.finally(() => current)
  repoMutexes.set(repo, chain)

  await previous
  try {
    return await fn()
  }
  finally {
    release!()
    if (repoMutexes.get(repo) === chain)
      repoMutexes.delete(repo)
  }
}
