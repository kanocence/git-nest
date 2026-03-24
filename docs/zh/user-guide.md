# Git Nest — 使用手册

> 通过 Web UI 和 SSH 使用 Git Nest 的完整指南

---

## 1. Web UI 使用

### 1.1 访问 Web 界面

1. 打开浏览器访问 `http://your-git-nest-ip:3000`
2. 如果配置了 `WEB_PASSWORD`，需要输入密码登录
3. 进入后可以看到仓库列表页面

### 1.2 创建仓库

1. 点击 **"创建仓库"** 按钮
2. 输入仓库名称（如 `my-project`）
3. 点击确认

**仓库名称规则**：
- 只允许小写字母、数字、下划线、点、横杠
- 首字符必须是字母或数字
- 长度不超过 64 字符

### 1.3 查看仓库详情

1. 点击仓库名称进入详情页
2. 可以查看 **提交历史** 标签页
3. 可看到提交 hash、作者、时间和消息

### 1.4 删除仓库

1. 在仓库详情页点击 **"删除仓库"** 按钮
2. 确认删除操作（不可恢复）

---

## 2. SSH 克隆和推送

### 2.1 克隆仓库

```bash
# 在本地机器上克隆（替换为你的 SSH 地址和宿主机路径）
# 路径应与 .env 中 SSH_GIT_PATH 一致
git clone git@your-ssh-host:/data/git/my-project.git

# 或者使用 SSH 端口（如果非标准端口）
git clone ssh://git@your-ssh-host:22/data/git/my-project.git
```

**首次连接时会提示确认主机密钥**，输入 `yes` 即可。

### 2.2 推送代码

```bash
cd my-project

# 初始化（如果需要）
git init
git add .
git commit -m "Initial commit"

# 添加远程仓库（路径与 .env 中 SSH_GIT_PATH 一致）
git remote add origin git@your-ssh-host:/data/git/my-project.git

# 推送（首次推送设置上游分支）
git push -u origin main
```

### 2.3 拉取更新

```bash
cd my-project
git pull origin main
```

### 2.4 SSH URL 格式说明

SSH Clone URL 格式：`git@your-ssh-host:/data/git/my-project.git`

| 部分 | 说明 |
|------|------|
| `git` | git 用户 |
| `your-ssh-host` | SSH 服务器地址（来自 `SSH_HOST` 配置） |
| `/data/git` | 仓库路径（来自 `SSH_GIT_PATH` 配置） |
| `my-project.git` | 仓库名 |

---

## 3. 日常操作流程

### 3.1 首次使用流程

```
1. 访问 Web UI → 创建仓库 → 获取 SSH 地址
2. 本地克隆仓库 → 开发代码 → git commit
3. git push 推送代码到 Git Nest
```

### 3.2 团队协作流程

```
1. 团队成员配置 SSH 公钥（由管理员添加到 authorized_keys）
2. 团队成员克隆仓库
3. 各自开发功能 → git commit → git push
4. 其他成员 git pull 获取最新代码
```

### 3.3 备份和恢复

参见 [部署和运维手册 - 备份与恢复](deployment.md#3-备份与恢复)

---

## 4. 常见问题

### 4.1 仓库名称已存在

每个仓库名称必须唯一，不能重复创建同名仓库。

### 4.2 SSH 连接被拒绝

检查：
1. `authorized_keys` 文件是否正确配置
2. SSH 服务是否正常运行
3. 防火墙是否允许 SSH 端口

### 4.3 push 失败

常见原因：
1. 未正确配置 remote：`git remote -v` 检查
2. 权限不足：确认 SSH 公钥已添加到服务器
3. 仓库不存在：先在 Web UI 创建仓库

### 4.4 Web UI 显示仓库但 SSH 无法访问

确认 `SSH_GIT_PATH` 配置与 `GIT_DATA_DIR` 指向相同目录。
