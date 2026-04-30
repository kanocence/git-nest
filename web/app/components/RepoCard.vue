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
    class="p-4 border border-gray-200 rounded-lg block cursor-pointer transition-colors dark:border-gray-700 hover:border-teal-500 dark:hover:border-teal-500"
  >
    <div class="flex items-center justify-between">
      <div class="flex gap-2 items-center">
        <Icon name="i-carbon-repo-source-code" class="text-lg text-teal-600" />
        <span class="text-lg font-semibold">{{ repo.name }}</span>
      </div>
      <span
        v-if="repo.headBranch"
        class="text-xs text-gray-600 px-2 py-0.5 rounded-full bg-gray-100 dark:text-gray-400 dark:bg-gray-800"
      >
        {{ repo.headBranch }}
      </span>
    </div>
    <div class="text-sm text-gray-500 mt-2">
      <span>Updated {{ lastModified }}</span>
    </div>
  </NuxtLink>
</template>
