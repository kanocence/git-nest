<script setup lang="ts">
const router = useRouter()

definePageMeta({
  layout: 'default',
})
</script>

<template>
  <div class="py-20 text-center">
    <Icon name="i-carbon-warning" class="text-5xl text-gray-300 mx-auto mb-4 block" />
    <h1 class="text-2xl font-semibold mb-2">
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
