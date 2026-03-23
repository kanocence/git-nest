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
        class="text-sm text-white px-4 py-2 text-center bg-amber-500 dark:bg-amber-600"
      >
        <span class="i-carbon-warning-alt mr-1 align-text-bottom" />
        Git Runner is unreachable — repository operations are temporarily unavailable.
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
        class="text-sm text-white px-4 py-2 text-center bg-orange-500 dark:bg-orange-600"
      >
        <span class="i-carbon-data-volume mr-1 align-text-bottom" />
        Disk usage at {{ diskUsedPct.toFixed(1) }}% — consider freeing space.
      </div>
    </Transition>
  </div>
</template>
