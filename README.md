# Git Nest 🪺

轻量级 Git 仓库管理系统。

适用场景：
- 小团队协作开发，使用 Web UI 管理权限和仓库
- 个人开发者在 VPS/NAS 上管理代码仓库
- 同步工作电脑内容，回家后通过 Web UI 访问和编辑

## 核心理念

基于 Docker Compose 部署，提供 Nuxt.js Web 界面管理 bare 仓库，集成 code-server 实现在线编辑。

**权限分离**：Nuxt 前端只做授权与调度，所有 git/文件操作由受限的 `git-runner` sidecar 容器以 `git` 用户身份执行。SSH push/pull 走传统 git 协议，Web 界面负责管理与可视化。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────────┐   HTTP (internal)   ┌───────────────┐  │
│  │   nuxt-app   │ ─────────────────>  │  git-runner   │  │
│  │  (Web UI +   │                     │  (Go sidecar) │  │
│  │  Server API) │                     │  UID=git user │  │
│  └──────┬───────┘                     └───────┬───────┘  │
│         │ :3000                               │          │
│         │                         ┌───────────┤          │
│  ┌──────┴───────┐            /data/git   /data/workspace │
│  │  code-server │                 │           │          │
│  │   (可选)     │─────────────────┘───────────┘          │
│  └──────┬───────┘                                        │
│         │ :8443                                          │
└─────────┴────────────────────────────────────────────────┘
                         │
              SSH (git@host) push/pull
                         │
                    ┌────┴────┐
                    │  开发者  │
                    └─────────┘
```

## 系统截图

![Git Nest 管理界面](docs/img/screencapture-git-nest.png)

![Code Server 在线编辑](docs/img/screencapture-code-server.png)

## 服务组件

| 服务 | 说明 | 技术栈 | 端口 |
|------|------|--------|------|
| **nuxt-app** | Web UI + Server API，负责授权调度 | Nuxt 4 + Nitro | 3000 |
| **git-runner** | 执行 git 操作的受限后端 | Go | 内部 3001 |
| **code-server** | 在线代码编辑器（可选） | code-server | 8443 |

## 快速开始

### 前置条件

- Docker & Docker Compose
- 宿主机上已创建 `git` 用户（用于 SSH push/pull）
- 已初始化 `/data/git` 和 `/data/workspace` 目录

### 部署

```bash
# 克隆项目
git clone <repo-url> git-nest && cd git-nest

# 配置环境变量
cp .env.example .env
# 编辑 .env 设置 PUID/PGID 等

# 启动服务
docker compose up -d
```

### 本地开发

```bash
# 前端开发
cd web && pnpm install && pnpm dev

# git-runner 开发 (需要 Go 1.21+)
cd runner && go run .
```

## 安全要点

1. **白名单执行**：git-runner 仅接受预定义的 git 命令，拒绝任意 shell 执行
2. **仓库名校验**：只允许 `[a-z0-9_.-]+`，防止路径穿越攻击
3. **内部网络隔离**：git-runner 不对外暴露端口，仅接受 Docker 内部网络请求
4. **API 认证**：git-runner 使用 shared secret 认证，防止未授权访问
5. **超时与限流**：所有操作设置执行超时，防止命令挂死
6. **日志审计**：记录所有通过 Web 触发的操作

## 相关文档

- [docs/zh/deployment.md](docs/zh/deployment.md) — 部署和运维手册（服务器部署、环境配置、故障排查）
- [docs/zh/user-guide.md](docs/zh/user-guide.md) — 使用手册（Web UI 操作、SSH 克隆/推送）
- [web/README.md](web/README.md) — 前端开发说明（技术栈、本地开发、API 路由规范）

## License

[MIT](LICENSE)
