<script setup lang="ts">
const authRequired = ref(false)

// 检查是否需要认证（用于显示退出按钮）
onMounted(async () => {
  try {
    const status = await $fetch<{ authenticated: boolean, required: boolean }>('/api/auth/status')
    authRequired.value = status.required
  }
  catch {
    // ignore
  }
})

async function handleLogout() {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await navigateTo('/login')
  }
  catch {
    // ignore
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Runner Degraded Banner -->
    <RunnerStatusBanner />

    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-800">
      <NuxtLink to="/" class="flex items-center gap-2 text-lg font-600 hover:text-teal-600 transition-colors">
        🪺 Git Nest
      </NuxtLink>
      <div class="flex items-center gap-3">
        <button
          v-if="authRequired"
          class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="Sign out"
          @click="handleLogout"
        >
          <span class="i-carbon-logout text-lg" />
        </button>
        <DarkToggle />
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <slot />
    </main>

    <!-- Footer -->
    <Footer />
  </div>
</template>
