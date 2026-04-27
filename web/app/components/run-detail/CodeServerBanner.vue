<script setup lang="ts">
defineProps<{
  editorUrl: string
}>()
</script>

<template>
  <div class="banner">
    <div class="banner-content">
      <span class="i-carbon-information banner-icon" />
      <div class="banner-text">
        <div class="banner-title">
          在 code-server 中查看变更
        </div>
        <p class="banner-desc">
          AI 任务已在工作区中创建了变更。请在 code-server 中查看完整的代码差异和审查变更。
        </p>
        <a
          :href="editorUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="banner-link"
        >
          <span class="i-carbon-code" />
          打开 code-server
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner {
  margin-bottom: var(--space-6);
  padding: var(--space-4);
  border: 1px solid var(--color-info-border-subtle);
  border-radius: var(--border-radius-lg);
  background-color: var(--color-info-bg-subtle);
}

.banner-content {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.banner-icon {
  font-size: var(--font-size-xl);
  color: var(--color-info);
  margin-top: 2px;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
}

.banner-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.banner-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.banner-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-inverse);
  background-color: var(--color-info);
  border-radius: var(--border-radius-md);
  text-decoration: none;
  transition: opacity var(--transition-fast);
}

.banner-link:hover {
  opacity: 0.9;
}
</style>
