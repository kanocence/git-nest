<script setup lang="ts">
defineProps<{
  title: string
}>()

defineEmits<{
  confirm: []
}>()

const visible = defineModel<boolean>({ default: false })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="flex items-center inset-0 justify-center fixed z-50"
      >
        <!-- Backdrop -->
        <div
          class="bg-black/50 inset-0 absolute"
          @click="visible = false"
        />

        <!-- Dialog -->
        <div class="mx-4 p-6 rounded-xl bg-white max-w-md w-full shadow-xl relative z-10 dark:bg-gray-900">
          <h3 class="text-lg font-600 mb-4">
            {{ title }}
          </h3>

          <slot />

          <div class="mt-6 flex gap-2 justify-end">
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
