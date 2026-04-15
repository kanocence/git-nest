# Git Nest 部署与运维手册

> 面向服务器部署和日常运维，覆盖 Web、`git-runner`、`agent`、`code-server` 四个服务。

## 1. 服务器准备

### 1.1 创建数据目录

```bash
mkdir -p ./data/git ./data/workspace ./data/agent-state ./data/backups
```

目录说明：

- `./data/git`：bare 仓库目录
- `./data/workspace`：共享工作区，人工与 AI 共用
- `./data/agent-state`：AI 运行状态目录，包含 SQLite 数据库
- `./data/backups`：备份目录

### 1.2 权限建议

如果宿主机需要通过固定 UID/GID 运行容器，建议提前让这些目录对对应用户可写。

```bash
chown -R 1000:1000 ./data
chmod -R g+rw ./data
```

如果你使用单独的 `git` 用户，也可以把目录所有者设为该用户，并让 `.env` 中的 `PUID`/`PGID` 与之保持一致。

## 2. 环境变量

复制模板：

```bash
cp .env.example .env
```

关键变量如下：

| 变量 | 说明 |
|------|------|
| `PUID` / `PGID` | `git-runner` 和 `code-server` 访问数据目录时使用的 UID/GID |
| `GIT_RUNNER_SECRET` | Nuxt 访问 `git-runner` 的共享密钥 |
| `AGENT_SECRET` | Nuxt 访问 `agent` 的共享密钥 |
| `WEB_PASSWORD` | Web 登录密码，可留空 |
| `GIT_DATA_DIR` | bare 仓库目录 |
| `GIT_WORKSPACE_DIR` | 共享工作区目录 |
| `AGENT_STATE_DIR` | AI 状态目录，默认 `./data/agent-state` |
| `AGENT_EXECUTOR_MAX_TURNS` | 单任务最大模型交互轮数 |
| `AGENT_EXECUTOR_TIMEOUT_MS` | 执行器超时（毫秒） |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | OpenAI-compatible 模型配置 |
| `GOOSE_PROVIDER` / `GOOSE_MODEL` | Goose CLI 使用的 provider 和模型 |
| `COMMAND_TIMEOUT_MS` | agent 命令超时 |
| `AGENT_GIT_USER_NAME` / `AGENT_GIT_USER_EMAIL` | agent 自动提交身份 |
| `BACKUP_DIR` | 备份目录 |
| `WEB_PORT` | Web 对外端口 |
| `CODE_SERVER_PORT` | `code-server` 对外端口 |
| `CODE_SERVER_URL` | Web 页面的 “Open in Editor” 跳转地址 |
| `NUXT_PUBLIC_SERVER_HOST` / `SSH_HOST` / `SSH_PORT` / `SSH_GIT_PATH` | SSH Clone URL 展示相关配置 |

建议：

- `GIT_RUNNER_SECRET` 和 `AGENT_SECRET` 都使用随机字符串
- 生产环境不要留空 `WEB_PASSWORD`
- `AGENT_STATE_DIR` 不要和 `workspace` 混用
- 配置 Goose CLI 所需的模型环境变量后再运行 agent

## 3. 启动服务

```bash
docker compose up -d
docker compose ps
```

预期会看到：

- `git-nest-web`
- `git-nest-runner`
- `git-nest-agent`
- `git-nest-editor`

其中 `git-runner` 与 `agent` 都带有健康检查。

## 4. 健康检查与日志

### 4.1 Web

```bash
curl http://localhost:${WEB_PORT:-3000}
```

### 4.2 git-runner

```bash
docker compose ps git-runner
docker compose logs -f git-runner
```

### 4.3 agent

```bash
docker compose ps agent
docker compose logs -f agent
```

`agent` 容器内有 `/health` 检查，Compose 会直接用它判断服务是否就绪。

### 4.4 code-server

```bash
docker compose ps code-server
docker compose logs -f code-server
```

## 5. AI 相关目录与状态文件

`AGENT_STATE_DIR` 目前至少会包含：

```text
agent-state/
└── state.sqlite
```

当前已经会在该目录下继续保存 run 级事件与模型回合产物。

## 6. 共享 Workspace 运维约束

当前 AI 方案不是独立沙箱，而是共享 `GIT_WORKSPACE_DIR`：

- `code-server` 打开的是 `/workspace`
- `agent` 也直接使用同一目录
- 每个 AI 任务通过切换到 `ai/<runId>` 分支工作

因此需要接受下面这些约束：

- 同一仓库同时只允许一个活跃 AI run
- 启动任务前，`/workspace/<repo>` 必须是干净工作区
- AI run 运行期间，不要人工修改同一仓库目录
- 任务完成或取消后，目录可能仍停留在任务分支，人工审查前先确认当前分支

## 7. 升级与重启行为

`agent` 在启动时会扫描历史锁和 runs：

- `queued` / `waiting_approval` 视为可恢复状态，run manager 会自动恢复队列或等待审批
- 已终态 run（`completed` / `failed` / `cancelled`）会清理残留锁
- 其他异常锁定中的 run 会被标记为 `system_interrupted`，支持通过 Web 页面重试

这能避免容器异常退出后仓库永久处于占用状态。

## 8. AI 功能边界

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

## 9. 常用排障命令

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

## 10. 相关文档

- [user-guide.md](user-guide.md)
- [ai-agent.md](ai-agent.md)
