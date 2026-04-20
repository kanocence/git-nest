# Git Nest 使用手册

> 面向日常使用，介绍 Web UI、SSH、`code-server` 和 AI 任务面板。

## 1. Web UI

### 1.1 访问

1. 打开 `http://<server>:<WEB_PORT>`
2. 如果配置了 `WEB_PASSWORD`，先登录
3. 进入仓库列表页

### 1.2 创建与查看仓库

1. 在首页点击“创建仓库”
2. 输入仓库名
3. 进入仓库详情页后可查看：
   - SSH Clone URL
   - Workspace 状态
   - AI Tasks 面板
   - 最近提交

### 1.3 删除仓库

在仓库详情页点击删除按钮即可。该操作不可恢复。

## 2. SSH Clone / Push / Pull

### 2.1 Clone

```bash
git clone git@your-ssh-host:/data/git/my-project.git
```

如果 SSH 端口不是默认值：

```bash
git clone ssh://git@your-ssh-host:2222/data/git/my-project.git
```

### 2.2 Push

```bash
cd my-project
git add .
git commit -m "Initial commit"
git push origin main
```

### 2.3 Pull

```bash
git pull origin main
```

## 3. Code Server

### 3.1 打开编辑器

仓库已 clone 到 workspace 后，仓库详情页会出现 “Open in Editor”。

默认会直接打开：

```text
/workspace/<repo>
```

### 3.2 使用建议

- 如果 AI 正在占用该仓库，不要同时人工改动同一目录
- 开始人工审查前，先确认当前分支
- AI run 完成后，目录可能已经切到 `ai/<runId>` 分支

## 4. AI 任务文件

AI 任务定义来自仓库中的 YAML 文件，而不是 Web 上传。

约定位置：

```text
.git-nest/tasks/*.yaml
```

你可以通过两种方式维护它们：

- 本地 clone 后提交推送
- 在 `code-server` 中直接编辑并提交

### 4.1 支持的 YAML 结构

```yaml
title: Add repo download archive
base_branch: main
max_iterations: 3

nodes:
  - id: pm
    role: pm
    prompt: Clarify the work and break it down.

  - id: dev
    role: developer
    prompt: Implement the feature.
    tools:
      - git
      - terminal

  - id: review
    role: reviewer
    prompt: Review the diff and report issues.

edges:
  - from: pm
    to: dev
    condition: success

  - from: dev
    to: review
    condition: success
```

校验规则：

- `nodes` 必须是非空数组
- `edges` 必须是数组
- 允许的 `role`：`pm`、`developer`、`tester`、`reviewer`、`human_approval`
- 允许的 `condition`：`success`、`needs_changes`、`approved`、`rejected`、`failed`
- 节点 ID 必须唯一
- 边引用的节点必须存在
- 图必须无环

## 5. 仓库页中的 AI Tasks 面板

仓库详情页显示：

- 共享 workspace 路径
- 当前分支
- 工作区是否干净
- 仓库是否被 AI 占用
- 活跃 run ID 和任务分支
- 仓库下所有任务 YAML 的解析结果
- 对有效任务显示 `Start Run` 按钮

如果某个 YAML 非法，会显示：

- `Invalid YAML`
- 解析错误
- 结构校验错误

## 6. `/tasks` 页面

导航栏里的 `/tasks` 页面会列出所有 AI runs，包括：

- 仓库名
- 任务标题 / 任务文件
- 任务分支
- 状态
- 更新时间
- 最近错误

点击某个 run 标题后，会进入 run 详情页，查看：

- 实时 SSE 事件流（executor log、状态变更）
- 节点开始/完成事件
- 命令执行结果
- patch 应用结果
- 最终错误或失败 checkpoint 信息

在 run 详情页还可以根据状态执行操作：

- `waiting_approval`：Approve / Reject
- `waiting_continuation`：Continue / Stop
- `system_interrupted`：Retry
- `running` / `queued` / `preparing`：Release（取消或解除占用）

## 7. AI 功能边界

已实现：

- 任务发现与 YAML 校验
- 共享 workspace 状态展示
- run 列表、详情读取与 SSE 实时事件
- 后端 `start/release/approve/reject/continue/stop/retry` API
- Hermes 执行器对接
- 通过 Docker CLI 启动 Hermes 容器调用模型
- 自动 git commit / push
- Web 审批、重试与释放操作

尚未实现：

- webhook 通知（计划功能，仅保留配置入口）

Web 上现在是一个“完整执行控制台”：可以启动任务、实时观测执行日志、审批敏感节点、重试中断任务，以及手动释放占用的工作区。

## 8. 开发者可用的临时 API

Nuxt 代理层提供了这些接口：

```text
GET  /api/repos/:repo/ai/tasks
GET  /api/repos/:repo/ai/workspace
POST /api/repos/:repo/ai/tasks/start
GET  /api/ai/runs
GET  /api/ai/runs/:id
POST /api/ai/runs/:id/resume
POST /api/ai/runs/:id/continue
POST /api/ai/runs/:id/stop
POST /api/ai/runs/:id/release
GET  /api/ai/events
```

注意：

- `start` 会准备共享 workspace、切任务分支并自动启动后台执行
- `resume` / `approve` / `reject` 适用于 `waiting_approval` 状态；审批状态已持久化到 SQLite，agent 重启后会自动恢复
- `continue` / `stop` 适用于 `waiting_continuation` 状态；当 executor 超时或明确返回可继续状态时，用户可以继续给它一段预算或停止任务
- `release` 适用于所有活跃 run（`running` / `queued` / `preparing` / `waiting_continuation`），会根据状态自动发送取消信号或解除仓库锁
- `retry` 适用于 `system_interrupted` 状态的 run
- 如果 YAML 含有 `require_approval: true`，run 会在验收前进入 `waiting_approval`

## 9. 常见问题

### 9.1 为什么我看得到任务 YAML，但不能在页面里直接运行

仓库页可以直接启动有效任务；缺的是审批、恢复和更复杂的执行控制，而不是启动入口本身。

### 9.2 为什么仓库被标记为 `AI Occupied`

说明该仓库存在活跃 run，AI 占用了共享工作区。此时不要人工同时修改同一目录。

### 9.3 为什么任务启动前要求工作区干净

因为 AI 和人工共用 `/workspace/<repo>`。如果工作区有未提交改动，系统无法区分哪些改动属于人工、哪些属于 AI。

### 9.4 没有配置 API Key 时能不能跑

不能。需要配置 Hermes 执行器所需的环境变量，并根据选用的 Provider 设置对应的 API Key：

```bash
# Hermes 基础配置
HERMES_PROVIDER=openrouter
HERMES_MODEL=meta-llama/llama-3.1-70b-instruct

# Provider API Key（根据 HERMES_PROVIDER 选择）
OPENROUTER_API_KEY=sk-or-...
```

## 10. 相关文档

- [deployment.md](deployment.md)
- [ai-agent.md](ai-agent.md)
