# Git Nest Agent

Git Nest Agent 是 Git Nest 系统的 AI 任务执行引擎，负责解析和执行基于 YAML 定义的任务流程。Agent 作为平台层协调外部 Coding Executor（如 Goose CLI）完成任务执行，提供 HTTP API 接口供前端调用。

## 架构概述

Git Nest Agent 采用分层架构：

- **Platform Layer**: API 路由、数据库、Git 操作、事件总线、Webhook 配置入口
- **RunManager**: 运行生命周期管理（启动、执行、完成、取消）
- **CodingExecutor**: 外部执行器接口（Goose CLI、Mock 等）

## 功能介绍

### 核心特性

- **外部执行器支持**：集成 Goose CLI 等外部 Coding Executor
- **简化任务定义**：使用描述性 YAML 格式定义任务需求和验收标准
- **人工审批节点**：支持在任务完成后插入人工审批
- **Git 工作区管理**：使用 git worktree 实现运行级工作区隔离
- **验收命令**：自动执行验收测试验证执行结果
- **实时事件通知**：通过 SSE 提供实时事件；Webhook 保留为计划功能配置入口
- **运行恢复机制**：支持中断恢复、重试和取消运行

### 运行状态

```
queued → preparing → running → waiting_approval → completed
                      ↓                              ↓
                   failed/cancelled/system_interrupted
```

| 状态                 | 说明                 |
| -------------------- | -------------------- |
| `queued`             | 任务已入队，等待执行 |
| `preparing`          | 正在准备工作区       |
| `running`            | 正在执行中           |
| `waiting_approval`   | 等待人工审批         |
| `completed`          | 成功完成             |
| `failed`             | 执行失败             |
| `cancelled`          | 已取消               |
| `system_interrupted` | 系统中断（可重试）   |

## 目录结构

```
agent/
├── src/
│   ├── config/           # 配置加载
│   │   └── index.ts      # 环境变量解析和配置对象创建
│   ├── db/               # 数据库操作
│   │   └── index.ts      # SQLite 数据库 API
│   ├── middleware/       # Hono 中间件
│   │   ├── auth.ts       # API 认证中间件
│   │   └── error.ts      # 错误处理中间件
│   ├── routes/           # API 路由
│   │   └── index.ts      # 所有 HTTP 端点定义
│   ├── services/         # 核心服务
│   │   ├── executors/    # 外部执行器适配器
│   │   │   ├── index.ts  # 执行器工厂
│   │   │   ├── types.ts  # 执行器接口定义
│   │   │   ├── goose.ts  # Goose CLI 适配器
│   │   ├── run-manager.ts # 运行生命周期管理器
│   │   ├── git.ts        # Git 操作服务
│   │   ├── tasks.ts      # 任务定义解析
│   ├── types/            # TypeScript 类型定义
│   │   └── index.ts      # 所有类型定义
│   ├── utils/            # 工具函数
│   │   ├── errors.ts     # 错误类和类型守卫
│   │   ├── events.ts     # SSE 事件总线
│   │   ├── locks.ts      # 仓库互斥锁
│   │   └── status.ts     # 运行状态常量
│   ├── index.ts          # 应用入口
│   └── logger.ts         # 日志工具
├── package.json
├── tsconfig.json
└── README.md
```

## 环境变量配置

### 必需配置

| 变量名                   | 默认值 | 必填 | 说明                                    |
| ------------------------ | ------ | ---- | --------------------------------------- |
| `API_SECRET`             | -      | 是\* | API 认证密钥，用于 Bearer Token 认证    |
| `ALLOW_INSECURE_NO_AUTH` | -      | 否   | 设置为 `1` 可禁用认证（仅用于本地开发） |

\* 如果设置了 `ALLOW_INSECURE_NO_AUTH=1` 则可不设置 `API_SECRET`

### 服务器配置

| 变量名      | 默认值 | 说明                                    |
| ----------- | ------ | --------------------------------------- |
| `PORT`      | `3002` | HTTP 服务器端口                         |
| `LOG_LEVEL` | `info` | 日志级别：`debug`/`info`/`warn`/`error` |

### 路径配置

| 变量名              | 默认值                      | 说明                           |
| ------------------- | --------------------------- | ------------------------------ |
| `GIT_DATA_DIR`      | `./data/git`                | Git 裸仓库目录                 |
| `GIT_WORKSPACE_DIR` | `./data/workspace`          | 工作区目录                     |
| `AGENT_STATE_DIR`   | `/tmp/git-nest-agent-state` | 状态文件目录（数据库、检查点） |

### 执行器配置

| 变量名                      | 默认值    | 说明                                     |
| --------------------------- | --------- | ---------------------------------------- |
| `AGENT_EXECUTOR_MAX_TURNS`  | `30`      | 最大对话轮数（Goose `--max-turns` 参数） |
| `AGENT_EXECUTOR_TIMEOUT_MS` | `1800000` | 执行超时（毫秒，默认 30 分钟）           |
| `GIT_TIMEOUT_MS`            | `30000`   | Git 命令超时时间（毫秒）                 |
| `COMMAND_TIMEOUT_MS`        | `120000`  | 普通命令超时时间（毫秒）                 |

### Goose 执行器配置

Goose 执行器通过环境变量直接配置，Agent 只做透传。根据你使用的 Provider 设置对应的环境变量：

**通用配置：**

| 变量名                 | 默认值        | 说明                                         |
| ---------------------- | ------------- | -------------------------------------------- |
| `GOOSE_PROVIDER`       | `openai`      | Goose provider（openai/anthropic/google 等） |
| `GOOSE_MODEL`          | `gpt-4o-mini` | 模型名称                                     |
| `AGENT_MODEL_PROVIDER` | -             | 兼容旧配置，会被 `GOOSE_PROVIDER` 覆盖       |
| `AGENT_MODEL`          | -             | 兼容旧配置，会被 `GOOSE_MODEL` 覆盖          |

**各 Provider 配置示例：**

```bash
# OpenAI
export OPENAI_API_KEY=sk-xxx
export GOOSE_PROVIDER=openai
export GOOSE_MODEL=gpt-4o

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-xxx
export GOOSE_PROVIDER=anthropic
export GOOSE_MODEL=claude-3-5-sonnet-20241022

# Google Gemini
export GOOGLE_API_KEY=xxx
export GOOSE_PROVIDER=google
export GOOSE_MODEL=gemini-2.0-flash-exp

# Azure OpenAI
export AZURE_OPENAI_API_KEY=xxx
export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
export AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
export GOOSE_PROVIDER=azure_openai
export GOOSE_MODEL=gpt-4o

# Ollama（本地模型）
export OLLAMA_HOST=http://localhost:11434
export GOOSE_PROVIDER=ollama
export GOOSE_MODEL=qwen2.5

# Kimi / MiniMax / 其他 OpenAI 兼容服务
export OPENAI_API_KEY=sk-xxx
export OPENAI_BASE_URL=https://api.moonshot.cn/v1
export GOOSE_PROVIDER=openai
export GOOSE_MODEL=moonshot-v1-8k
```

### Git 配置

| 变量名                 | 默认值              | 说明                     |
| ---------------------- | ------------------- | ------------------------ |
| `AGENT_GIT_USER_NAME`  | `Git Nest AI`       | AI 提交使用的 Git 用户名 |
| `AGENT_GIT_USER_EMAIL` | `ai@git-nest.local` | AI 提交使用的 Git 邮箱   |

### Webhook 配置（计划功能）

| 变量名                | 默认值  | 说明                     |
| --------------------- | ------- | ------------------------ |
| `WEBHOOK_URL`         | -       | Webhook 接收 URL（可选） |
| `WEBHOOK_SECRET`      | -       | Webhook 签名密钥（可选） |
| `WEBHOOK_TIMEOUT_MS`  | `30000` | Webhook 请求超时         |
| `WEBHOOK_MAX_RETRIES` | `3`     | Webhook 失败重试次数     |

## API 接口列表

### 健康检查

```http
GET /health
```

**响应：**

```json
{
  "status": "ok",
  "dbPath": "/tmp/git-nest-agent-state/state.sqlite"
}
```

---

### SSE 事件流

```http
GET /api/events
```

建立 Server-Sent Events 连接，接收实时事件通知。

**事件类型：**

- `connected` - 连接成功
- `run.started` - 运行开始
- `run.queued` - 任务入队
- `run.completed` - 运行完成
- `run.failed` - 运行失败
- `run.cancelled` - 运行取消
- `run.waiting_approval` - 等待审批
- `node.started` - 节点开始
- `node.completed` - 节点完成
- `node.action` - 节点执行动作

---

### 列出任务

```http
GET /api/repos/:repo/tasks?ref=main
```

**参数：**

- `repo` - 仓库名称
- `ref`（可选）- Git 引用，默认为默认分支

**响应：**

```json
{
  "repo": "my-repo",
  "ref": "main",
  "tasks": [
    {
      "path": ".git-nest/tasks/feature-impl.yaml",
      "title": "功能实现任务",
      "baseBranch": "main",
      "maxIterations": 5,
      "hasHumanApproval": true,
      "roles": ["pm", "developer", "reviewer"],
      "nodeCount": 3,
      "edgeCount": 2,
      "valid": true,
      "parseError": null,
      "validationErrors": []
    }
  ],
  "total": 1
}
```

---

### 获取工作区状态

```http
GET /api/repos/:repo/workspace-state
```

**响应：**

```json
{
  "repo": "my-repo",
  "path": "/data/workspace/my-repo",
  "exists": true,
  "isGitRepo": true,
  "clean": false,
  "currentBranch": "ai/abc-123",
  "currentCommit": "a1b2c3d",
  "occupiedByAi": true,
  "activeRunId": "abc-123",
  "activeTaskBranch": "ai/abc-123",
  "lockStatus": "running",
  "lockUpdatedAt": "2024-01-15T10:30:00Z"
}
```

---

### 开始任务

```http
POST /api/repos/:repo/tasks/start
Content-Type: application/json

{
  "taskPath": ".git-nest/tasks/feature-impl.yaml",
  "ref": "main"
}
```

**请求体：**

- `taskPath`（必需）- 任务 YAML 文件路径
- `ref`（可选）- Git 引用

**响应（202 Accepted）：**

```json
{
  "run": {
    "id": "abc-123",
    "repo": "my-repo",
    "task_path": ".git-nest/tasks/feature-impl.yaml",
    "task_title": "功能实现任务",
    "source_ref": "main",
    "base_branch": "main",
    "task_branch": "ai/abc-123",
    "status": "queued",
    "workspace_path": "/data/workspace/my-repo",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "last_error": null
  },
  "workspace": {
    // ...
  },
  "note": "The shared workspace and task branch are prepared. Background execution starts automatically."
}
```

**错误码：**

- `400 TASK_PATH_REQUIRED` - 缺少 taskPath
- `404 TASK_NOT_FOUND` - 任务文件不存在
- `409 REPO_BUSY` - 仓库正被其他运行占用

---

### 列出运行

```http
GET /api/runs
```

**响应：**

```json
{
  "runs": [
    {
      "id": "abc-123",
      "repo": "my-repo",
      "task_path": ".git-nest/tasks/feature-impl.yaml",
      "task_title": "功能实现任务",
      "source_ref": "main",
      "base_branch": "main",
      "task_branch": "ai/abc-123",
      "status": "completed",
      "workspace_path": "/data/workspace/my-repo",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:35:00Z",
      "last_error": null
    }
  ],
  "total": 1
}
```

---

### 获取运行详情

```http
GET /api/runs/:runId
```

**响应：**

```json
{
  "run": {
    // ...
  },
  "events": [
    {
      "id": 1,
      "run_id": "abc-123",
      "type": "run.started",
      "node_id": null,
      "role": null,
      "message": "Run execution started",
      "payload": {
        // ...
      },
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "workspace": {
    // ...
  }
}
```

---

### 恢复运行

```http
POST /api/runs/:runId/resume
Content-Type: application/json

{
  "resume": "approved"
}
```

或

```json
{
  "decision": "approved"
}
```

**请求体：**

- `resume` 或 `decision`（必需）- `approved` 或 `rejected`，或使用布尔值

**响应（202 Accepted）：**

```json
{
  "run": {
    // ...
  },
  "note": "Run resume has been scheduled."
}
```

**错误码：**

- `400 RESUME_VALUE_REQUIRED` - 缺少 resume/decision 值
- `400 INVALID_APPROVAL_DECISION` - 无效的审批决策
- `404 RUN_NOT_FOUND` - 运行不存在
- `409 RUN_NOT_WAITING_APPROVAL` - 运行不处于等待审批状态
- `409 RUN_BUSY` - 运行正在被处理

---

### 批准运行

```http
POST /api/runs/:runId/approve
```

快捷方式，等同于 `resume` with `approved`。

**响应（202 Accepted）：**

```json
{
  "run": {
    // ...
  },
  "note": "Run has been approved and will continue execution."
}
```

---

### 拒绝运行

```http
POST /api/runs/:runId/reject
```

快捷方式，等同于 `resume` with `rejected`。

**响应（202 Accepted）：**

```json
{
  "run": {
    // ...
  },
  "note": "Run has been rejected and will be terminated."
}
```

---

### 重试运行

```http
POST /api/runs/:runId/retry
```

仅支持 `system_interrupted` 状态的运行。

**响应（202 Accepted）：**

```json
{
  "run": {
    // ...
  },
  "note": "Run has been scheduled for retry."
}
```

**错误码：**

- `404 RUN_NOT_FOUND` - 运行不存在
- `409 RUN_NOT_RETRYABLE` - 运行不处于可重试状态
- `409 REPO_BUSY` - 仓库被其他运行占用

---

### 释放运行

```http
POST /api/runs/:runId/release
```

取消正在运行的任务或释放已完成的任务。

**响应（202 Accepted - running 状态）：**

```json
{
  "run": {
    // ...
  },
  "note": "Cancellation signal sent. The run will terminate at the next safe checkpoint."
}
```

**响应（200 OK - 其他状态）：**

```json
{
  "run": {
    // ...
  },
  "workspace": {
    // ...
  }
}
```

**错误码：**

- `404 RUN_NOT_FOUND` - 运行不存在
- `409 RUN_NOT_RELEASABLE` - 运行不可释放
- `409 RUN_NOT_CANCELLABLE` - 运行无法取消

## 任务定义 YAML 格式规范 (v2)

任务定义文件存储在仓库的 `.git-nest/tasks/` 目录下，使用 YAML 格式。

### 基本结构

```yaml
# 任务标题
title: 功能实现任务

# 详细描述（发送给外部执行器）
description: |
  实现用户登录功能：
  1. 添加用户名/密码验证
  2. 实现 JWT Token 生成
  3. 添加登录状态保持

# 基础分支（可选，默认 main）
base_branch: main

# 是否需要人工审批（可选，默认 false）
require_approval: true

# 验收配置（可选）
acceptance:
  commands:
    - npm test
    - npm run lint
    - npm run build
  timeout: 300000 # 单个命令超时（毫秒），默认 5 分钟
  fail_fast: true # 第一个失败就停止，默认 true

# 执行器配置（可选）
executor:
  max_turns: 30 # 最大对话轮数，默认 30
  timeout: 1800000 # 执行超时（毫秒），默认 30 分钟
```

### 字段说明

#### 根级别字段

| 字段               | 类型    | 必需 | 说明                         |
| ------------------ | ------- | ---- | ---------------------------- |
| `title`            | string  | 是   | 任务标题                     |
| `description`      | string  | 否   | 任务详细描述，发送给执行器   |
| `base_branch`      | string  | 否   | 基础分支，默认 main          |
| `require_approval` | boolean | 否   | 是否需要人工审批，默认 false |

#### 验收配置

| 字段        | 类型     | 必需 | 说明                 |
| ----------- | -------- | ---- | -------------------- |
| `commands`  | string[] | 否   | 验收命令列表         |
| `timeout`   | number   | 否   | 单个命令超时（毫秒） |
| `fail_fast` | boolean  | 否   | 第一个失败就停止     |

#### 执行器配置

| 字段        | 类型   | 必需 | 说明             |
| ----------- | ------ | ---- | ---------------- |
| `max_turns` | number | 否   | 最大对话轮数     |
| `timeout`   | number | 否   | 执行超时（毫秒） |

### v1 格式兼容

旧版的 nodes/edges 格式仍然支持，但会打印弃用警告并自动转换为 v2 格式。建议尽快迁移到新格式。

## 开发指南

### 本地开发

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 构建
pnpm build

# 生产模式
pnpm start
```

### 测试任务定义

可以在本地仓库创建测试任务：

```yaml
# .git-nest/tasks/test.yaml
title: 测试任务
description: 这是一个测试任务，用于验证 Agent 配置
acceptance:
  commands:
    - "echo 'Hello from Git Nest Agent'"
```

## 部署指南

### Docker 部署

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3002
CMD ["pnpm", "start"]
```

### 环境要求

- Node.js >= 22.0.0
- pnpm >= 10.0.0
- Git

### 生产环境建议

1. **务必设置 `API_SECRET`**，禁用 `ALLOW_INSECURE_NO_AUTH`
2. **配置持久化存储**：将 `AGENT_STATE_DIR` 挂载到持久卷
3. **配置 Webhook**：当前仅保留环境变量入口和 URL 校验，发送能力属于计划功能
4. **配置日志收集**：通过 `LOG_LEVEL` 控制日志级别
5. **监控资源使用**：Agent 会执行 Git 命令和可能的构建命令

## 测试

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行测试并监视文件变化
pnpm test:watch

# 运行测试并生成覆盖率报告
pnpm test:coverage
```

### 测试结构

```
tests/
├── unit/              # 单元测试
│   ├── services/      # 服务层测试
│   │   ├── tasks.test.ts
│   │   ├── model.test.ts
│   │   └── git.test.ts
│   ├── utils/         # 工具函数测试
│   │   ├── errors.test.ts
│   │   ├── locks.test.ts
│   │   └── status.test.ts
│   └── db.test.ts     # 数据库操作测试
├── integration/       # 集成测试
│   └── routes.test.ts # API 路由测试
├── fixtures/          # 测试数据
│   ├── tasks/         # 任务定义示例
└── helpers/           # 测试辅助
    ├── factory.ts
    ├── test-db.ts
    └── test-utils.ts
```

### 已知问题

所有测试均可正常通过（145 个测试）。

---

如有其他问题或建议，欢迎提交 Issue 或 PR。
