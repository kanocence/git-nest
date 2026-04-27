<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="info-field">
    <div class="info-label">
      {{ label }}
    </div>
    <div class="info-value">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.info-field {
  margin-bottom: var(--space-4);
}

.info-field:last-child {
  margin-bottom: 0;
}

.info-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.info-value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}
</style>
