import antfu from '@antfu/eslint-config'
import tsPlugin from '@typescript-eslint/eslint-plugin'

export default antfu({
  // 注册 TypeScript 插件
  plugins: {
    '@typescript-eslint': tsPlugin,
  },
  // 基础 TypeScript 配置
  typescript: true,

  // 格式化配置
  formatters: {
    css: true,
    html: true,
    markdown: 'prettier',
  },

  // 自定义规则
  rules: {
    // 禁止直接使用 console，强制使用 consola
    'no-console': ['warn', { allow: ['error', 'warn'] }],

    // 允许 _ 开头的未使用变量（用于解构时忽略）
    'unused-imports/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],

    // 样式偏好
    'style/semi': ['error', 'never'],
    'style/quotes': ['error', 'single'],

    // 针对 Node.js 环境的调整
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
  },

  // 忽略文件
  ignores: [
    'dist/**',
    'node_modules/**',
    '*.lock',
  ],
})
