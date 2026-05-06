<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

withDefaults(defineProps<{
  title: string
  size?: 'default' | 'wide'
}>(), {
  size: 'default',
})

const visible = defineModel<boolean>({ default: false })
</script>

<template>
  <DialogRoot v-model:open="visible">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="modal-content" :class="{ 'modal-content--wide': size === 'wide' }">
        <DialogTitle class="modal-title">
          {{ title }}
        </DialogTitle>

        <div class="modal-body">
          <slot />
        </div>

        <div class="modal-actions">
          <DialogClose as-child>
            <ActionButton label="Cancel" variant="secondary" />
          </DialogClose>
          <slot name="actions" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: var(--bg-overlay);
  z-index: var(--z-modal);
  animation: overlayShow 150ms ease;
}

.modal-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-modal);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-xl);
  padding: var(--space-6);
  width: calc(100vw - 2rem);
  max-width: 28rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  scrollbar-gutter: stable;
  animation: contentShow 150ms ease;
}

.modal-content--wide {
  max-width: 64rem;
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-4);
}

.modal-body {
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  margin-top: var(--space-6);
}

@keyframes overlayShow {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes contentShow {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
