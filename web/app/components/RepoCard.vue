<script setup lang="ts">
import type { RepoInfo } from '~/types'

const props = defineProps<{
  repo: RepoInfo
}>()

const lastModified = useTimeAgo(() => new Date(props.repo.lastModified))
</script>

<template>
  <NuxtLink
    :to="`/repos/${repo.name}`"
    class="block p-4 border border-gray-200 dark:border-gray-700 rounded-lg
           hover:border-teal-500 dark:hover:border-teal-500 transition-colors
           cursor-pointer"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="i-carbon-repository text-lg text-teal-600" />
        <span class="font-600 text-lg">{{ repo.name }}</span>
      </div>
      <span
        v-if="repo.headBranch"
        class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
      >
        {{ repo.headBranch }}
      </span>
    </div>
    <div class="mt-2 text-sm text-gray-500">
      <span>Updated {{ lastModified }}</span>
    </div>
  </NuxtLink>
</template>
