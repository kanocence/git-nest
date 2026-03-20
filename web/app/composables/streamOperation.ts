export interface SSEEvent {
  type: 'progress' | 'done' | 'error'
  message?: string
  exitCode?: number
}

export type OperationType = 'clone' | 'pull'

export interface OperationRecord {
  id: number
  type: OperationType
  repo: string
  startedAt: Date
  lines: string[]
  status: 'running' | 'success' | 'failed'
  exitCode?: number
}

/**
 * 封装 SSE 流式操作（clone/pull）
 */
export function useStreamOperation() {
  const operations = ref<OperationRecord[]>([])
  const currentOp = ref<OperationRecord | null>(null)
  let nextId = 1

  /**
   * 执行流式操作（clone 或 pull）
   */
  async function execute(type: OperationType, repoName: string): Promise<OperationRecord> {
    const op: OperationRecord = {
      id: nextId++,
      type,
      repo: repoName,
      startedAt: new Date(),
      lines: [],
      status: 'running',
    }

    currentOp.value = op
    operations.value.unshift(op)

    const url = `/api/repos/${repoName}/${type}`

    try {
      const response = await fetch(url, { method: 'POST' })

      if (!response.ok || !response.body) {
        op.status = 'failed'
        op.lines.push(`Error: HTTP ${response.status} — ${response.statusText}`)
        currentOp.value = null
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
      op.status = 'failed'
      op.lines.push(`Connection error: ${err.message || 'unknown'}`)
    }
    finally {
      currentOp.value = null
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
        op.exitCode = event.exitCode
        op.status = event.exitCode === 0 ? 'success' : 'failed'
        break
      case 'error':
        op.exitCode = event.exitCode
        op.status = 'failed'
        if (event.message)
          op.lines.push(`Error: ${event.message}`)
        break
    }
  }

  const isRunning = computed(() => currentOp.value !== null)

  return {
    operations,
    currentOp,
    isRunning,
    execute,
  }
}
