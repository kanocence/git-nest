/**
 * Runner 健康状态 composable
 * 定期检查 git-runner 可用性，供全局降级提示使用
 */
export function useRunnerHealth() {
  const healthy = ref(true)
  const checking = ref(false)
  const diskWarning = ref('')
  const diskUsedPct = ref(0)

  interface HealthResponse {
    runner: 'ok' | 'unavailable'
    status: string
    disk?: { totalBytes: number, freeBytes: number, usedBytes: number, usedPct: number } | null
    warning?: string | null
  }

  const { data, refresh } = useFetch<HealthResponse>('/api/health', {
    key: 'runner-health',
    server: false,
    immediate: true,
    watch: false,
  })

  // 根据响应更新状态
  watch(data, (val) => {
    if (val) {
      healthy.value = val.runner === 'ok'
      diskWarning.value = val.warning || ''
      diskUsedPct.value = val.disk?.usedPct || 0
    }
  })

  // 每 60 秒检查一次
  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = setInterval(() => {
      refresh()
    }, 60_000)
  })

  onUnmounted(() => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  })

  return {
    healthy,
    checking,
    diskWarning,
    diskUsedPct,
    refresh,
  }
}
