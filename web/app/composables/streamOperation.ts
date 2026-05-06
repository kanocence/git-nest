export interface SSEEvent {
  type: 'progress' | 'done' | 'error'
  message?: string
  exitCode?: number
}

export type OperationType = 'clone' | 'pull' | 'import'

export interface OperationRecord {
  id: number
  type: OperationType
  repo: string
  startedAt: Date
  lines: string[]
  status: 'running' | 'success' | 'failed'
  exitCode?: number
}

const controllers = new Map<string, AbortController>()

/**
 * 封装 SSE 流式操作（clone/pull/import）
 */
export function useStreamOperation() {
  const operations = useState<OperationRecord[]>('workspace:stream-operations', () => [])
  const nextId = useState('workspace:stream-operation-next-id', () => 1)
  const localOperationKeys = new Set<string>()

  // 作用域销毁时（如组件卸载）自动中止未完成的 SSE 操作
  onScopeDispose(() => {
    for (const key of localOperationKeys) {
      controllers.get(key)?.abort()
      controllers.delete(key)
    }
    localOperationKeys.clear()
  })

  /**
   * 执行流式操作（clone、pull 或 import）
   */
  async function execute(type: OperationType, repoName: string, options?: { remoteUrl?: string }): Promise<OperationRecord> {
    const operationKey = `${type}:${repoName}`
    const existingController = controllers.get(operationKey)
    if (existingController)
      existingController.abort()

    const controller = new AbortController()
    controllers.set(operationKey, controller)
    localOperationKeys.add(operationKey)

    const op: OperationRecord = {
      id: nextId.value++,
      type,
      repo: repoName,
      startedAt: new Date(),
      lines: [],
      status: 'running',
    }

    operations.value.unshift(op)

    const url = type === 'import' ? '/api/repos/import' : `/api/repos/${repoName}/${type}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: type === 'import' ? { 'Content-Type': 'application/json' } : undefined,
        body: type === 'import' ? JSON.stringify({ name: repoName, remoteUrl: options?.remoteUrl }) : undefined,
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        op.status = 'failed'
        op.lines.push(`Error: HTTP ${response.status} — ${response.statusText}`)
        return op
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 消息：data: {...}\n\n
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || '' // 最后一部分可能不完整

        for (const part of parts) {
          const lines = part.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: '))
              continue
            try {
              const event: SSEEvent = JSON.parse(line.slice(6))
              handleEvent(op, event)
            }
            catch {
              // 非 JSON 行，作为文本输出
              op.lines.push(line.slice(6))
            }
          }
        }
      }

      // 处理剩余 buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6))
              handleEvent(op, event)
            }
            catch {
              op.lines.push(line.slice(6))
            }
          }
        }
      }

      // 如果没有收到 done 事件，标记为失败
      if (op.status === 'running') {
        op.status = 'failed'
        op.lines.push('Connection closed without completion')
      }
    }
    catch (err: any) {
      if (err.name === 'AbortError') {
        op.status = 'failed'
        op.lines.push('Operation cancelled')
      }
      else {
        op.status = 'failed'
        op.lines.push(`Connection error: ${err.message || 'unknown'}`)
      }
    }
    finally {
      if (controllers.get(operationKey) === controller)
        controllers.delete(operationKey)
      localOperationKeys.delete(operationKey)
    }

    return op
  }

  function handleEvent(op: OperationRecord, event: SSEEvent) {
    switch (event.type) {
      case 'progress':
        if (event.message)
          op.lines.push(event.message)
        break
      case 'done':
        op.exitCode = event.exitCode ?? 0
        op.status = (event.exitCode ?? 0) === 0 ? 'success' : 'failed'
        break
      case 'error':
        op.exitCode = event.exitCode
        op.status = 'failed'
        if (event.message)
          op.lines.push(`Error: ${event.message}`)
        break
    }
  }

  const currentOp = computed(() => operations.value.find(op => op.status === 'running') || null)
  const runningByRepo = computed(() => {
    const map: Record<string, boolean> = {}
    for (const op of operations.value) {
      if (op.status === 'running')
        map[op.repo] = true
    }
    return map
  })
  const isRunning = computed(() => Boolean(currentOp.value))

  function isRepoRunning(repoName: string) {
    return Boolean(runningByRepo.value[repoName])
  }

  return {
    operations,
    currentOp,
    isRunning,
    isRepoRunning,
    runningByRepo,
    execute,
  }
}
