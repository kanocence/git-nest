<script setup lang="ts">
const emit = defineEmits<{
  created: [name: string]
}>()

const visible = ref(false)
const repoName = ref('')
const { createRepo, loading, error } = useRunner()

const nameError = computed(() => {
  if (!repoName.value) return ''
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(repoName.value)) {
    return 'Only lowercase letters, digits, "_", ".", "-" allowed (start with letter or digit)'
  }
  if (repoName.value.length > 64) {
    return 'Name too long (max 64 characters)'
  }
  return ''
})

const canSubmit = computed(() => {
  return repoName.value.length > 0 && !nameError.value && !loading.value
})

async function handleCreate() {
  if (!canSubmit.value) return

  try {
    await createRepo(repoName.value)
    emit('created', repoName.value)
    visible.value = false
    repoName.value = ''
    error.value = null
  }
  catch {
    // error is already set in useRunner
  }
}

function open() {
  visible.value = true
  repoName.value = ''
  error.value = null
}

defineExpose({ open })
</script>

<template>
  <ModalDialog v-model="visible" title="Create Repository">
    <div class="space-y-3">
      <div>
        <label class="block text-sm font-500 mb-1 text-gray-600 dark:text-gray-400">
          Repository Name
        </label>
        <input
          v-model="repoName"
          type="text"
          placeholder="my-project"
          autocomplete="off"
          class="w-full px-3 py-2 border rounded-lg bg-transparent outline-none
                 border-gray-200 dark:border-gray-700
                 focus:border-teal-500 dark:focus:border-teal-500 transition-colors"
          @keydown.enter="handleCreate"
        >
      </div>

      <p v-if="nameError" class="text-sm text-red-500">
        {{ nameError }}
      </p>

      <p v-if="error" class="text-sm text-red-500">
        {{ error }}
      </p>

      <p class="text-xs text-gray-400">
        A bare repository <code>{{ repoName || 'name' }}.git</code> will be created.
      </p>
    </div>

    <template #actions>
      <ActionButton
        label="Create"
        icon="i-carbon-add"
        :loading="loading"
        :disabled="!canSubmit"
        @click="handleCreate"
      />
    </template>
  </ModalDialog>
</template>
