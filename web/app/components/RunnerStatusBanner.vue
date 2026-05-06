<script setup lang="ts">
const { healthy, diskWarning, diskUsedPct } = useRunnerHealth()
</script>

<template>
  <div>
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform -translate-y-full opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-full opacity-0"
    >
      <div
        v-if="!healthy"
        class="flex items-center justify-center gap-2 text-sm text-white px-4 py-2 bg-amber-500 dark:bg-amber-600"
      >
        <Icon name="i-carbon-warning-alt" class="shrink-0 text-base" />
        <span>Git Runner is unreachable — repository operations are temporarily unavailable.</span>
      </div>
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform -translate-y-full opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-full opacity-0"
    >
      <div
        v-if="healthy && diskWarning"
        class="flex items-center justify-center gap-2 text-sm text-white px-4 py-2 bg-orange-500 dark:bg-orange-600"
      >
        <Icon name="i-carbon-data-volume" class="shrink-0 text-base" />
        <span>Disk usage at {{ diskUsedPct.toFixed(1) }}% — consider freeing space.</span>
      </div>
    </Transition>
  </div>
</template>
