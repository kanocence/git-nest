# Git Nest AI Agent 文档

> 说明当前 `agent` 的实现范围、共享 workspace 模型、任务 YAML 结构和现有 API。

## 1. 当前实现状态

Git Nest 的 AI 能力已实现可运行的核心闭环。

已完成：

- `agent` 独立服务与 Compose 集成
- 与 Nuxt 的代理层对接
- 仓库级互斥锁
- 共享 workspace 状态探测
- 任务 YAML 发现与解析
- DAG 基础校验
- 基于 Goose CLI 的执行器
- 通过 Goose CLI 调用模型
- run 持久化、事件日志、SSE 实时推送
- 容器重启后的锁恢复和队列恢复
- 审批状态持久化到 SQLite（重启后可恢复 `waiting_approval`）
- Web 前端审批（Approve/Reject）、重试（Retry）和释放（Release）

尚未实现：

- 多节点之间的有界循环迭代（`needs_changes` 自动回溯）
- webhook 事件通知（计划功能，当前仅保留配置入口）

## 2. 架构位置

当前 AI 相关链路如下：

```text
Browser
  -> Nuxt /api/*
  -> agent
  -> shared /workspace/<repo>
  -> bare repo in /data/git
```

职责划分：

- `nuxt-app`：代理 AI API，承载任务列表、详情和审批/重试/释放等交互页面
- `agent`：管理任务定义、状态、锁、共享目录准备
- `git-runner`：继续负责传统 Git/workspace/backup 能力，不承担 agent 执行
- `code-server`：直接打开共享工作区，方便人工审查

## 3. 共享 Workspace 模型

当前没有独立 `agent workspace`。AI 与人工共用：

```text
/workspace/<repo>
```

运行规则：

- 每个任务使用独立分支 `ai/<runId>`
- 同一仓库只允许一个活跃 run
- 任务启动前要求工作区干净
- 任务结束后目录保留在任务分支，便于直接在 `code-server` 审查

设计取舍：

- 优点：可观测性强，人工审查链路短
- 缺点：隔离性弱，AI 运行期间不能人工同时改同一仓库目录

## 4. 状态机

当前统一使用以下状态名：

```text
queued
preparing
running
waiting_approval
completed
failed
cancelled
system_interrupted
```

当前最常见的状态是：

- `preparing`
- `queued`
- `running`
- `failed`
- `cancelled`
- `system_interrupted`

说明：

- `queued` 当前表示“共享工作区和任务分支已经准备完成，后台执行器即将接管”
- `running` 表示最小执行器正在调用模型并推进节点

## 5. 任务 YAML

任务文件必须位于：

```text
.git-nest/tasks/*.yaml
```

### 5.1 当前支持的字段

根字段：

- `title` 或 `name`
- `base_branch`
- `max_iterations`
- `nodes`
- `edges`

节点字段：

- `id`
- `role`
- `prompt`
- `tools`

边字段：

- `from`
- `to`
- `condition`

### 5.2 允许值

允许的角色：

- `pm`
- `developer`
- `tester`
- `reviewer`
- `human_approval`

允许的边条件：

- `success`
- `needs_changes`
- `approved`
- `rejected`
- `failed`

### 5.3 当前校验内容

- YAML 语法必须正确
- 根对象必须是 map/object
- `nodes` 必须为非空数组
- `edges` 必须为数组
- 节点 `id` 必须唯一
- 节点 `role` 必须在白名单中
- 边引用的节点必须存在
- 图必须无环
- `max_iterations` 如果存在，必须是正整数

### 5.4 示例

```yaml
title: Add AI repo summary panel
base_branch: main
max_iterations: 5

nodes:
  - id: plan
    role: pm
    prompt: Clarify the goal and produce a short plan.

  - id: implement
    role: developer
    prompt: Implement the requested changes.
    tools:
      - git
      - terminal

  - id: test
    role: tester
    prompt: Run relevant verification and summarize failures.

  - id: review
    role: reviewer
    prompt: Review the diff and identify risks.

edges:
  - from: plan
    to: implement
    condition: success

  - from: implement
    to: test
    condition: success

  - from: test
    to: review
    condition: success
```

注意：

- 当前执行器支持无环 DAG
- review 返回 `needs_changes` 的有界迭代尚未实现
- `human_approval` 节点会进入 `waiting_approval`
- 审批状态已持久化到 SQLite，`resume` 接口在 agent 重启后仍可恢复

## 6. 当前 API

### 6.1 Nuxt 对外代理

```text
GET  /api/repos/:repo/ai/tasks
GET  /api/repos/:repo/ai/workspace
POST /api/repos/:repo/ai/tasks/start
GET  /api/ai/runs
GET  /api/ai/runs/:id
POST /api/ai/runs/:id/resume
POST /api/ai/runs/:id/release
GET  /api/ai/events
```

### 6.2 agent 内部接口

```text
GET  /health
GET  /api/repos/:repo/tasks
GET  /api/repos/:repo/workspace-state
POST /api/repos/:repo/tasks/start
GET  /api/runs
GET  /api/runs/:id
POST /api/runs/:id/resume
POST /api/runs/:id/release
GET  /api/events
```

### 6.3 当前语义

- `GET /api/repos/:repo/ai/tasks`
  返回任务文件摘要和校验结果
- `GET /api/repos/:repo/ai/workspace`
  返回共享工作区状态和当前 AI 占用信息
- `POST /api/repos/:repo/ai/tasks/start`
  准备 workspace、切任务分支、加锁并自动启动后台执行
- `POST /api/ai/runs/:id/resume`
  恢复 `waiting_approval` 状态的 run；审批决策已持久化到 SQLite，agent 重启后可自动恢复
- `POST /api/ai/runs/:id/release`
  释放活跃 run：对 `running` 状态发送协作式取消信号；对 `queued`/`preparing` 直接释放仓库锁并将 run 置为 `cancelled`

## 7. Web 页面

当前已接入三个入口：

- 仓库详情页中的 `AI Tasks` 区块
- 顶部导航中的 `/tasks`
- `/tasks/:id` run 详情页

当前页面能力：

- 查看共享 workspace 状态
- 查看任务 YAML 校验结果
- 在仓库页启动有效任务
- 查看 runs 列表与基本信息
- 查看 run 详情和 SSE 实时事件流
- 对 `waiting_approval` run 执行批准/驳回
- 对 `system_interrupted` run 执行重试
- 对 `running`/`queued`/`preparing` run 执行释放（Release）

当前页面不支持：

- 查看完整模型原始响应文件

## 8. 持久化与恢复

当前使用 `SQLite` 保存：

- runs
- repo_locks
- run_events

默认数据库文件：

```text
${AGENT_STATE_DIR}/state.sqlite
```

启动恢复策略：

- 孤儿锁直接清理
- 终态 run 的残留锁会清理
- `queued` 保留并继续调度
- `waiting_approval`：若 SQLite 中存在审批状态则保留，否则标为 `system_interrupted`
- 其他中间态 run 标为 `system_interrupted`

## 9. 已知限制

- 只支持无环 DAG
- `needs_changes` 条件不会自动触发迭代回溯，需要人工启动新 run
- webhook 通知尚未实现，当前仅保留配置入口
- 共享 workspace 隔离性较弱，AI 运行期间不建议人工同时修改同一目录

## 10. 下一阶段建议

1. 实现 `needs_changes` 条件下的自动迭代回溯
2. 补齐 webhook 通知发送与前端展示
3. 增加 run 级别的统计与历史趋势

## 11. 相关文档

- [deployment.md](deployment.md)
- [user-guide.md](user-guide.md)
