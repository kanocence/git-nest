<script setup lang="ts">
definePageMeta({
  layout: false,
})

useHead({ title: 'Login — Git Nest' })

const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    })
    // 登录成功，跳转首页
    await navigateTo('/')
  }
  catch (e: any) {
    error.value = e?.data?.message || e?.statusMessage || 'Invalid password'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="px-4 bg-gray-50 flex min-h-screen items-center justify-center dark:bg-gray-900">
    <div class="max-w-sm w-full">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <h1 class="text-3xl font-700">
          🪺 Git Nest
        </h1>
        <p class="text-sm text-gray-500 mt-2">
          Enter password to continue
        </p>
      </div>

      <!-- Login Form -->
      <form
        class="p-6 border border-gray-200 rounded-xl bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
        @submit.prevent="handleLogin"
      >
        <div class="mb-4">
          <label for="password" class="text-sm text-gray-700 font-500 mb-1.5 block dark:text-gray-300">
            Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            class="text-gray-900 px-3 py-2 border border-gray-300 rounded-lg bg-white w-full dark:text-gray-100 focus:outline-none dark:border-gray-600 focus:border-transparent dark:bg-gray-900 focus:ring-2 focus:ring-teal-500 placeholder-gray-400"
            :disabled="loading"
            autofocus
          >
        </div>

        <!-- Error -->
        <div v-if="error" class="text-sm text-red-600 mb-4 p-3 rounded-lg bg-red-50 dark:text-red-400 dark:bg-red-900/20">
          <span class="i-carbon-warning mr-1" />
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading || !password"
          class="text-white font-500 px-4 py-2 rounded-lg bg-teal-600 flex gap-2 w-full transition-colors items-center justify-center hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span v-if="loading" class="i-carbon-circle-dash animate-spin" />
          <span>{{ loading ? 'Signing in...' : 'Sign in' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
