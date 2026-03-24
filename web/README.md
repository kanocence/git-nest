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

| 变量                   | 说明                                     | 默认值       |
| ---------------------- | ---------------------------------------- | ------------ |
| `GIT_RUNNER_HOST`      | git-runner 服务地址                      | `git-runner` |
| `GIT_RUNNER_PORT`      | git-runner 服务端口                      | `3001`       |
| `GIT_RUNNER_SECRET`    | API 认证密钥                             | —            |
| `NUXT_PUBLIC_NAS_HOST` | Web 界面域名或 IP                        | —            |
| `NUXT_PUBLIC_SSH_HOST` | SSH 服务主机名（留空则同 NAS_HOST）      | —            |
| `NUXT_PUBLIC_SSH_GIT_PATH` | 宿主机上 bare 仓库路径（SSH URL 路径） | `/data/git`  |

### API 路由规范

所有 `/api/repos/**` 请求由 Nitro 接收后转发到 git-runner：

```typescript
// server/api/repos/index.get.ts — 列出所有仓库
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
// server/api/repos/[name]/clone.post.ts — Clone 仓库
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')

  const { name } = getRouterParams(event)
  const body = await readBody(event)

  const response = await $fetch(
    `http://${runnerHost}:${runnerPort}/api/repos/${name}/clone`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      body,
    }
  )

  return response
})
```

前端通过 `EventSource` 接收流式事件：

```typescript
// app/composables/streamOperation.ts
export const streamOperation = (url: string) => {
  return new EventSource(url)
}
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

### Docker Compose 中的角色

在 docker-compose.yml 中，nuxt-app 服务通过内部网络与 git-runner 通信：

```yaml
services:
  nuxt-app:
    depends_on:
      git-runner:
        condition: service_healthy
    environment:
      - GIT_RUNNER_HOST=git-runner
      - GIT_RUNNER_PORT=3001
      - GIT_RUNNER_SECRET=${GIT_RUNNER_SECRET}
```

## IDE 推荐

推荐使用 [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) 扩展。

## 相关文档

- [../README.md](../README.md) — 项目总览
- [../docs/zh/deployment.md](../docs/zh/deployment.md) — 部署和运维手册
- [../docs/zh/user-guide.md](../docs/zh/user-guide.md) — 使用手册
