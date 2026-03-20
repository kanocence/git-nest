# Git Nest 🪺

> 个人 NAS 上的轻量级 Git 仓库管理系统

基于 Docker Compose 部署，提供 Nuxt.js Web 界面管理 bare 仓库，集成 code-server 实现在线编辑。

## 核心理念

**权限分离**：Nuxt 前端只做授权与调度，所有 git/文件操作由受限的 `git-runner` sidecar 容器以 `git` 用户身份执行。SSH push/pull 走传统 git 协议，Web 界面负责管理与可视化。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────────┐   HTTP (internal)   ┌───────────────┐  │
│  │   nuxt-app   │ ─────────────────▶  │  git-runner   │  │
│  │  (Web UI +   │                     │  (Go sidecar) │  │
│  │  Server API) │                     │  UID=git user  │  │
│  └──────┬───────┘                     └───────┬───────┘  │
│         │ :3000                               │          │
│         │                          ┌──────────┤          │
│  ┌──────┴───────┐            /data/git   /data/workspace │
│  │  code-server │                 │           │          │
│  │   (可选)      │─────────────────┘───────────┘          │
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

## 项目结构

```
git-nest/
├── README.md                # 本文件 - 项目总览
├── PLAN.md                  # 开发计划 (MVP → 生产)
├── docker-compose.yml       # 部署编排
├── .env.example             # 环境变量模板
├── docs/OPERATIONS.md       # 运维操作手册
├── web/                     # Nuxt.js 前端应用
│   ├── app/                 # 页面、组件、composables
│   ├── server/              # Nitro server API (代理 git-runner)
│   ├── Dockerfile           # 前端容器构建
│   └── ...
└── runner/                  # git-runner sidecar (待创建)
    ├── main.go              # Go HTTP 服务
    ├── Dockerfile
    └── ...
```

## 服务组件

| 服务 | 说明 | 技术栈 | 端口 |
|------|------|--------|------|
| **nuxt-app** | Web UI + Server API，负责授权调度 | Nuxt 4 + Nitro | 3000 |
| **git-runner** | 执行 git 操作的受限后端 | Go | 内部 3001 |
| **code-server** | 在线代码编辑器（可选） | code-server | 8443 |

## 目录与权限

| 路径 | 用途 | 所有者 |
|------|------|--------|
| `/data/git/*.git` | Bare 仓库 | `git:git` |
| `/data/workspace/{project}` | 工作目录 | `git:git` |
| `/home/git/.ssh/authorized_keys` | SSH 公钥 | `git:git` |

## API 概览

Nuxt Server API 代理转发至 git-runner：

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/repos` | 列出所有 bare 仓库 |
| `POST` | `/api/repos` | 创建 bare 仓库 |
| `GET` | `/api/repos/:name/log` | 查看提交日志 |
| `POST` | `/api/repos/:name/clone` | Clone 到 workspace |
| `POST` | `/api/repos/:name/pull` | 在 workspace 执行 pull |
| `DELETE` | `/api/repos/:name` | 删除仓库 |

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

- [PLAN.md](PLAN.md) — 详细开发计划与里程碑
- [web/README.md](web/README.md) — 前端应用开发说明
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — 运维操作手册（服务器部署、日常使用、故障排查）

## License

[MIT](LICENSE)

