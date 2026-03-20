/**
 * 封装 git-runner 操作调用
 */
export function useRunner() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 创建仓库
   */
  async function createRepo(name: string) {
    loading.value = true
    error.value = null
    try {
      const result = await $fetch('/api/repos', {
        method: 'POST',
        body: { name },
      })
      return result
    }
    catch (err: any) {
      const message = err?.data?.data?.error || err?.data?.error || err?.message || 'Failed to create repository'
      error.value = message
      throw new Error(message)
    }
    finally {
      loading.value = false
    }
  }

  /**
   * 删除仓库
   */
  async function deleteRepo(name: string) {
    loading.value = true
    error.value = null
    try {
      const result = await $fetch(`/api/repos/${name}`, {
        method: 'DELETE',
      })
      return result
    }
    catch (err: any) {
      const message = err?.data?.data?.error || err?.data?.error || err?.message || 'Failed to delete repository'
      error.value = message
      throw new Error(message)
    }
    finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    createRepo,
    deleteRepo,
  }
}
