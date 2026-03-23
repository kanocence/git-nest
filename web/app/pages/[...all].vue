<script setup lang="ts">
const router = useRouter()

definePageMeta({
  layout: 'default',
})
</script>

<template>
  <div class="py-20 text-center">
    <div class="i-carbon-warning text-5xl text-gray-300 mx-auto mb-4" />
    <h1 class="text-2xl font-600 mb-2">
      Page Not Found
    </h1>
    <p class="text-gray-500 mb-6">
      The page you're looking for doesn't exist.
    </p>
    <ActionButton
      label="Back"
      icon="i-carbon-arrow-left"
      variant="secondary"
      @click="router.back()"
    />
  </div>
</template>
