# Git Nest — Web 前端

> 基于 [Vitesse for Nuxt 4](https://github.com/antfu/vitesse-nuxt) 模板的 Git 仓库管理 Web 界面

## 技术栈

- 💚 [Nuxt 4](https://nuxt.com/) — SSR、文件路由、组件自动导入
- ⚡️ [Vite](https://vitejs.dev/) — 极速 HMR
- 🎨 [UnoCSS](https://github.com/unocss/unocss) — 原子化 CSS 引擎
- 📲 [VitePWA](https://github.com/vite-pwa/nuxt) — PWA 支持
- 🦾 TypeScript — 全量类型检查

## 目录结构

```
web/
├── app/
│   ├── components/       # 公共组件
│   ├── composables/      # 组合式函数
│   ├── config/           # 应用配置 (PWA 等)
│   ├── constants/        # 常量定义
│   ├── layouts/          # 布局
│   ├── pages/            # 文件路由页面
│   └── app.vue           # 根组件
├── server/
│   └── api/              # Nitro Server API（代理 git-runner）
├── public/               # 静态资源
├── nuxt.config.ts        # Nuxt 配置
├── uno.config.ts         # UnoCSS 配置
├── Dockerfile            # 容器构建
└── package.json
```

## 开发

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

### 构建

```bash
pnpm build
```

### 预览生产构建

```bash
pnpm preview
```

### 代码检查

```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript 类型检查
```

## Server API

Web 的 `server/api/` 目录下实现 Nitro API 路由，负责将前端请求代理转发至 `git-runner` 服务。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GIT_RUNNER_HOST` | git-runner 服务地址 | `git-runner` |
| `GIT_RUNNER_PORT` | git-runner 服务端口 | `3001` |
| `GIT_RUNNER_SECRET` | API 认证密钥 | — |
| `NUXT_PUBLIC_NAS_HOST` | NAS 的 IP 或域名（SSH Clone URL 显示用） | — |

### API 路由规范

所有 `/api/repos/**` 请求由 Nitro 接收后转发到 git-runner：

```typescript
// server/api/repos/index.get.ts — 示例
export default defineEventHandler(async () => {
  const data = await $fetch(`http://${runnerHost}:${runnerPort}/api/repos`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  return data
})
```

### 流式输出（SSE）

对于耗时操作（clone、pull），使用 Server-Sent Events 实时返回进度：

```typescript
// server/api/repos/[name]/clone.post.ts — 示例
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  // 转发 git-runner 的流式响应...
})
```

## Docker

```bash
# 构建镜像
docker build -t git-nest-web .

# 运行
docker run -p 3000:3000 \
  -e GIT_RUNNER_HOST=git-runner \
  -e GIT_RUNNER_SECRET=your-secret \
  git-nest-web
```

## IDE 推荐

推荐使用 [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) 扩展。
