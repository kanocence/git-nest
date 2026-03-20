<script setup lang="ts">
const visible = defineModel<boolean>({ default: false })

defineProps<{
  title: string
}>()

defineEmits<{
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="visible = false"
        />

        <!-- Dialog -->
        <div class="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4 z-10">
          <h3 class="text-lg font-600 mb-4">
            {{ title }}
          </h3>

          <slot />

          <div class="flex justify-end gap-2 mt-6">
            <ActionButton
              label="Cancel"
              variant="secondary"
              @click="visible = false"
            />
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
