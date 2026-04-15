# Git Nest 部署与运维手册

> 面向服务器部署和日常运维，覆盖 Web、`git-runner`、`agent`、`code-server` 四个服务。

## 1. 推荐部署方式：GHCR 预构建镜像

只部署预构建镜像时，不需要 clone 整个项目。最简单的方式是使用一键部署脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/kanocence/git-nest/dev/scripts/deploy.sh | sh
```

脚本会自动完成以下步骤：

1. 检查 `docker`、`curl` 依赖
2. 下载 `docker-compose.yml`、`docker-compose.release.yml`、`.env.example`、`scripts/init-host.sh`
3. 生成 `.env`（若不存在）并检查关键配置项
4. 执行 `init-host.sh` 初始化数据目录
5. 拉取镜像并启动服务

首次运行若提示修改 `.env`，编辑后重新执行该脚本即可。

如果希望手动执行，服务器需要 4 个文件：

- `docker-compose.yml`
- `docker-compose.release.yml`
- `.env`
- `scripts/init-host.sh`

其中 `docker-compose.yml` 定义服务，`docker-compose.release.yml` 让 Compose 优先拉取 GHCR 镜像，`.env.example` 是配置模板，`scripts/init-host.sh` 只负责初始化数据目录。

### 1.1 手动准备文件

```bash
mkdir -p git-nest/scripts
cd git-nest

curl -fsSLO https://raw.githubusercontent.com/kanocence/git-nest/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/kanocence/git-nest/main/docker-compose.release.yml
curl -fsSLO https://raw.githubusercontent.com/kanocence/git-nest/main/.env.example
curl -fsSL -o scripts/init-host.sh https://raw.githubusercontent.com/kanocence/git-nest/main/scripts/init-host.sh
chmod +x scripts/init-host.sh

cp .env.example .env
```

已经 clone 了仓库时，直接使用仓库内的这些文件即可。

### 1.2 修改 .env

部署前重点修改这些值：

- `PUID` / `PGID`：改为宿主机上负责读写数据目录的用户，例如 `id git` 查到的 UID/GID。
- `GIT_RUNNER_SECRET` / `AGENT_SECRET`：改为随机字符串，例如 `openssl rand -hex 32`。
- `WEB_PASSWORD`：生产环境建议设置。
- `GIT_DATA_DIR` / `GIT_WORKSPACE_DIR` / `AGENT_STATE_DIR` / `BACKUP_DIR`：数据目录，默认使用当前目录下的 `./data/...`。
- `SSH_HOST` / `SSH_PORT` / `SSH_GIT_PATH`：决定 Web 页面展示的 SSH clone 地址。
- `CODE_SERVER_URL`：决定 Web 页面 “Open in Editor” 跳转地址。
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `GOOSE_PROVIDER` / `GOOSE_MODEL`：按实际模型服务填写。
- `GIT_NEST_*_IMAGE`：默认使用官方 GHCR 镜像；fork 或自建镜像时把 `kanocence` 改为自己的 GitHub 用户名或组织名。

如果镜像包是 private，需要先登录 GHCR：

```bash
docker login ghcr.io
```

完整配置以 `.env.example` 为准。

### 1.3 手动启动

```bash
sh scripts/init-host.sh
docker compose -f docker-compose.yml -f docker-compose.release.yml pull
docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --no-build
docker compose ps
```

预期会看到：

- `git-nest-web`
- `git-nest-runner`
- `git-nest-agent`
- `git-nest-editor`

后续升级同样执行：

```bash
docker compose -f docker-compose.yml -f docker-compose.release.yml pull
docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --no-build
```

## 2. 自建镜像与开发部署

自建镜像或本地开发时再 clone 仓库。

```bash
git clone <repo-url> git-nest
cd git-nest
cp .env.example .env
```

项目内置 GitHub Actions 工作流 `.github/workflows/build-images.yml`，会构建并推送以下镜像到 GHCR：

- `ghcr.io/<owner>/git-nest-web`
- `ghcr.io/<owner>/git-nest-runner`
- `ghcr.io/<owner>/git-nest-agent`
- `ghcr.io/<owner>/git-nest-code-server`

触发条件：

- push 到 `main`
- push `v*` tag
- 手动 `workflow_dispatch`

构建缓存使用 Docker BuildKit 的 GitHub Actions cache，每个镜像独立 scope，避免 Nuxt、Agent、Runner 缓存互相污染。默认只构建 `linux/amd64`。`agent` 镜像当前下载的是 amd64 Go tarball，启用 arm64/multi-arch 前需要先改造 `agent/Dockerfile` 的 Go 下载逻辑。

如果不使用 GitHub Actions，也可以在服务器或开发机本地构建镜像。此时可以把 `.env` 中的 `GIT_NEST_*_IMAGE` 改成本地 tag，或删除这些变量使用 `docker-compose.yml` 中的默认 fallback。

```env
GIT_NEST_WEB_IMAGE=git-nest-web:local
GIT_NEST_RUNNER_IMAGE=git-nest-runner:local
GIT_NEST_AGENT_IMAGE=git-nest-agent:local
GIT_NEST_CODE_SERVER_IMAGE=git-nest-code-server:local
```

启动：

```bash
sh scripts/init-host.sh
docker compose up -d --build
docker compose ps
```

## 3. 健康检查与日志

### 3.1 Web

```bash
curl http://localhost:${WEB_PORT:-3000}
```

### 3.2 git-runner

```bash
docker compose ps git-runner
docker compose logs -f git-runner
```

### 3.3 agent

```bash
docker compose ps agent
docker compose logs -f agent
```

`agent` 容器内有 `/health` 检查，Compose 会直接用它判断服务是否就绪。

### 3.4 code-server

```bash
docker compose ps code-server
docker compose logs -f code-server
```

## 4. AI 相关目录与状态文件

`AGENT_STATE_DIR` 目前至少会包含：

```text
agent-state/
└── state.sqlite
```

当前已经会在该目录下继续保存 run 级事件与模型回合产物。

## 5. 共享 Workspace 运维约束

当前 AI 方案不是独立沙箱，而是共享 `GIT_WORKSPACE_DIR`：

- `code-server` 打开的是 `/workspace`
- `agent` 也直接使用同一目录
- 每个 AI 任务通过切换到 `ai/<runId>` 分支工作

因此需要接受下面这些约束：

- 同一仓库同时只允许一个活跃 AI run
- 启动任务前，`/workspace/<repo>` 必须是干净工作区
- AI run 运行期间，不要人工修改同一仓库目录
- 任务完成或取消后，目录可能仍停留在任务分支，人工审查前先确认当前分支
- `agent`、`git-runner`、`code-server` 都应使用同一组 `PUID` / `PGID` 访问共享目录

## 6. 升级与重启行为

`agent` 在启动时会扫描历史锁和 runs：

- `queued` / `waiting_approval` 视为可恢复状态，run manager 会自动恢复队列或等待审批
- 已终态 run（`completed` / `failed` / `cancelled`）会清理残留锁
- 其他异常锁定中的 run 会被标记为 `system_interrupted`，支持通过 Web 页面重试

这能避免容器异常退出后仓库永久处于占用状态。

## 7. AI 功能边界

当前版本已经实现：

- 任务发现与 YAML 解析校验
- 共享工作区状态展示与仓库锁管理
- run 记录、事件持久化与重启恢复
- 通过 Goose CLI 调用模型
- Goose 执行器对接与后台执行
- SSE 实时事件流推送
- 自动 git commit / push
- Web 审批（Approve / Reject）、重试（Retry）与释放（Release）

尚未实现：

- webhook 通知（计划功能，当前仅保留配置入口）
- webhook 通知发送与前端展示

## 8. 常用排障命令

```bash
docker compose ps
docker compose logs -f
docker compose logs -f git-runner
docker compose logs -f agent
docker compose logs -f nuxt-app
docker compose logs -f code-server
```

查看数据目录：

```bash
du -sh ./data/git ./data/workspace ./data/agent-state ./data/backups
```

## 9. 相关文档

- [user-guide.md](user-guide.md)
- [ai-agent.md](ai-agent.md)
