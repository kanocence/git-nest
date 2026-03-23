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
  <div class="flex flex-col min-h-screen">
    <!-- Runner Degraded Banner -->
    <RunnerStatusBanner />

    <!-- Top bar -->
    <header class="px-4 py-3 border-b border-gray-200 flex items-center justify-between sm:px-6 dark:border-gray-800">
      <NuxtLink to="/" class="text-lg font-600 flex gap-2 transition-colors items-center hover:text-teal-600">
        🪺 Git Nest
      </NuxtLink>
      <div class="flex gap-3 items-center">
        <button
          v-if="authRequired"
          class="text-gray-500 p-1.5 rounded-md transition-colors hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          title="Sign out"
          @click="handleLogout"
        >
          <span class="i-carbon-logout text-lg" />
        </button>
        <DarkToggle />
      </div>
    </header>

    <!-- Content -->
    <main class="px-4 py-6 flex-1 sm:px-6 sm:py-8">
      <slot />
    </main>

    <!-- Footer -->
    <Footer />
  </div>
</template>
