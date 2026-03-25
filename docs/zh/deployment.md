# Git Nest — 部署和运维手册

> 从零开始在服务器上部署 Git Nest 的完整指南

---

## 1. 服务器环境准备

### 1.1 创建 git 用户

在服务器上创建专门的 git 用户，用于管理仓库和 SSH 访问。

```bash
# 创建 git 用户，指定 UID/GID（建议与你的普通用户一致）
useradd -m -u 1000 -g 1000 -s /bin/bash git

# 设置密码（可选，SSH key 认证通常不需要）
passwd git
```

**说明**：
- `UID/GID 1000` 是默认示例，如果你的用户 UID/GID 不同，请相应调整
- PUID/PGID 环境变量必须与这里保持一致
- git 用户需要能写入你指定的 data 目录

### 1.2 创建目录结构

```bash
# 以 root 身份创建数据目录
mkdir -p ./data/git ./data/workspace ./data/backups

# 设置目录所有者为 git 用户
chown git:git ./data/git ./data/workspace ./data/backups

# 设置目录权限（组读写，便于后续管理）
chmod g+rw ./data/git ./data/workspace ./data/backups
```

**说明**：
- `./data/git` — 存储 bare 仓库（`.git` 后缀）
- `./data/workspace` — clone 操作的工作目录
- `./data/backups` — git bundle 备份文件

### 1.3 配置 SSH 公钥

```bash
# 切换到 git 用户
su - git

# 创建 SSH 目录
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 添加你的公钥（将下方的公钥替换为你的）
cat >> ~/.ssh/authorized_keys << 'EOF'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... your-email@example.com
EOF

# 设置权限
chmod 600 ~/.ssh/authorized_keys
```

**验证 SSH 配置**：
```bash
# 测试 SSH 连接（从客户端执行）
ssh git@your-server-ip -i ~/.ssh/id_ed25519
# 应该能登录，但会显示 "Remote closed connection"（git 用户无 shell，这是正常的）
```

---

## 2. Docker 部署

### 2.1 克隆项目

```bash
# 在服务器上克隆 Git Nest
cd /opt
git clone https://github.com/your-username/git-nest.git
cd git-nest
```

### 2.2 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置
nano .env
```

**关键配置项**：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `PUID`/`PGID` | git 用户的 UID/GID | `1000` |
| `GIT_RUNNER_SECRET` | API 认证密钥（**必须修改**） | `openssl rand -hex 32` |
| `WEB_PASSWORD` | Web 登录密码（留空则无密码） | `your-password` |
| `GIT_DATA_DIR` | Bare 仓库目录 | `./data/git` |
| `GIT_WORKSPACE_DIR` | 工作区目录 | `./data/workspace` |
| `BACKUP_DIR` | 备份目录 | `./data/backups` |
| `WEB_PORT` | Web 端口 | `3000` |
| `NUXT_PUBLIC_SERVER_HOST` | Web 界面域名或 IP | `git-nest.your-domain.com` |
| `SSH_HOST` | SSH 服务主机名（留空则同 SERVER_HOST） | `git.your-domain.com` |
| `SSH_PORT` | SSH 端口 | `22` |
| `SSH_GIT_PATH` | 宿主机上 bare 仓库路径 | `/data/git` |

**生成随机密钥**：
```bash
openssl rand -hex 32
```

### 2.3 启动服务

```bash
# 启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps
```

**预期输出**：
```
NAME                STATUS          PORTS
git-nest-web       Up              0.0.0.0:3000->3000/tcp
git-nest-runner    Up (healthy)    3001/tcp
git-nest-editor    Up              0.0.0.0:8443->8443/tcp
```

### 2.4 验证服务

```bash
# 检查 git-runner 健康状态
curl http://localhost:3001/health

# 预期返回：
# {"status":"ok","diskUsage":{"gitDir":1.2,"workspace":0.5,"backups":0.1}}

# 检查 Web 界面
curl http://localhost:3000/api/health

# 查看日志
docker compose logs -f git-runner
docker compose logs -f nuxt-app
```

---

## 3. 备份与恢复

### 3.1 手动触发备份

```bash
# 触发备份 API（需要认证）
curl -X POST http://localhost:3001/api/backups \
  -H "Authorization: Bearer ${GIT_RUNNER_SECRET}"

# 从服务器本地执行（绕过认证）
docker exec git-nest-runner wget -qO- --post-data="" \
  http://localhost:3001/api/backups
```

### 3.2 查看可用备份

```bash
curl http://localhost:3001/api/backups \
  -H "Authorization: Bearer ${GIT_RUNNER_SECRET}"
```

**预期返回**：
```json
{
  "backups": [
    {
      "name": "my-project-2024-01-15-030000.bundle",
      "repo": "my-project",
      "created": "2024-01-15T03:00:00Z",
      "size": 1048576
    }
  ]
}
```

### 3.3 从备份恢复

```bash
# 下载备份文件到本地
# 备份文件位置：/data/backups/*.bundle

# 从备份恢复到新仓库
git clone /data/backups/my-project-2024-01-15-030000.bundle /tmp/my-project-restore

# 进入目录验证
cd /tmp/my-project-restore
git log --oneline

# 如果正常，可以将其作为新的 bare 仓库
git init --bare ./data/git/my-project-restored.git
git push origin main  # 推送到新仓库
```

### 3.4 自动备份

Git Nest 默认每天凌晨 3 点自动执行备份，保留最近 7 天。可以在 `.env` 中调整：

```bash
BACKUP_RETENTION_DAYS=7      # 保留天数
BACKUP_SCHEDULE_HOUR=3       # 备份时间（小时）
```

---

## 4. 故障排查

### 4.1 服务启动失败

**检查 Docker 日志**：
```bash
docker compose logs git-runner
docker compose logs nuxt-app
```

**常见问题**：

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `port is already allocated` | 端口被占用 | 修改 `.env` 中的端口，或停止占用端口的服务 |
| `permission denied` | git 用户权限不足 | 检查 `/data/git` 等目录所有者是否为 `git:git` |
| `healthy` 状态为 `unhealthy` | 健康检查失败 | 检查 git 可执行文件和目录权限 |

### 4.2 SSH 认证失败

**客户端排查**：
```bash
# 详细模式连接
ssh -vvv git@your-server-ip

# 常见错误：
# - "Permission denied (publickey)" — 公钥未正确配置
# - "Host key verification failed" — 主机密钥未信任，先执行 ssh 连接一次
```

**服务器排查**：
```bash
# 检查 authorized_keys 格式
cat ~/.ssh/authorized_keys

# 确保权限正确
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### 4.3 磁盘空间不足

**检查磁盘使用**：
```bash
# 查看各目录大小
du -sh ./data/git ./data/workspace ./data/backups

# 查看 git-runner 健康状态
curl http://localhost:3001/health
```

**清理旧备份**：
```bash
# 手动清理超过保留期的备份
find ./data/backups -name "*.bundle" -mtime +7 -delete
```

### 4.4 权限错误

**检查目录权限**：
```bash
# 所有数据目录必须是 git:git 所有
ls -la ./data/

# 输出应类似：
# drwxr-xr-x  git git ./data/git
# drwxr-xr-x  git git ./data/workspace
# drwxr-xr-x  git git ./data/backups
```

**修复权限**：
```bash
chown -R git:git ./data/git ./data/workspace ./data/backups
chmod -R g+rw ./data/git ./data/workspace ./data/backups
```

### 4.5 查看服务日志

```bash
# 实时查看所有服务日志
docker compose logs -f

# 查看特定服务
docker compose logs -f git-runner
docker compose logs -f nuxt-app

# 查看最近 100 行
docker compose logs --tail=100 git-runner
```

### 4.6 Web UI 无法访问

```bash
# 检查 nuxt-app 容器状态
docker compose ps nuxt-app

# 检查端口是否正常映射
docker port git-nest-web

# 测试本地访问
curl http://localhost:3000
```

---

## 5. 快速参考

### 常用命令

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启服务
docker compose restart git-runner

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

### API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/health` | Web 健康检查 |
| `GET` | `/api/repos` | 列出所有仓库 |
| `POST` | `/api/repos` | 创建仓库 |
| `GET` | `/api/repos/:name/log` | 查看提交日志 |
| `POST` | `/api/repos/:name/clone` | Clone 到 workspace |
| `POST` | `/api/repos/:name/pull` | Pull 最新代码 |
| `DELETE` | `/api/repos/:name` | 删除仓库 |
| `GET` | `/api/backups` | 列出备份 |
| `POST` | `/api/backups` | 触发备份 |
| `GET` | `/api/events` | SSE 事件流 |

### 目录结构

```
/data/
├── git/                    # Bare 仓库
│   ├── my-project.git/     #   仓库名.git
│   └── another.git/
├── workspace/              # Clone 工作目录
│   └── my-project/         #   与仓库同名
└── backups/                # Git bundle 备份
    └── my-project-2024-01-15-030000.bundle
```
