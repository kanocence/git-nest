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
  <div class="login-page">
    <div class="login-container">
      <!-- Logo -->
      <div class="login-header">
        <h1 class="login-title">
          🪺 Git Nest
        </h1>
        <p class="login-subtitle">
          Enter password to continue
        </p>
      </div>

      <!-- Login Form -->
      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-field">
          <label for="password" class="form-label">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            class="form-input"
            :disabled="loading"
            autofocus
          >
        </div>

        <!-- Error -->
        <div v-if="error" class="alert alert--error">
          <span class="i-carbon-warning" />
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading || !password"
          class="submit-btn"
        >
          <span v-if="loading" class="i-carbon-circle-dash icon-spin" />
          <span>{{ loading ? 'Signing in...' : 'Sign in' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-4);
  background-color: var(--bg-elevated);
}

.login-container {
  width: 100%;
  max-width: 24rem;
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-8);
}

.login-title {
  font-size: 1.875rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.login-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-2);
}

.login-form {
  padding: var(--space-6);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-xl);
  background-color: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.form-field {
  margin-bottom: var(--space-4);
}

.form-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.form-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alert {
  padding: var(--space-3);
  border-radius: var(--border-radius-lg);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.alert--error {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.submit-btn {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-inverse);
  background-color: var(--color-primary);
  border: none;
  border-radius: var(--border-radius-lg);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.submit-btn:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
