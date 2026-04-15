#!/usr/bin/env sh
set -eu

REPO_RAW="https://raw.githubusercontent.com/kanocence/git-nest/dev"

# 颜色输出
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
nc='\033[0m' # No Color

log_info() {
  printf "${green}[INFO]${nc} %s\n" "$1"
}

log_warn() {
  printf "${yellow}[WARN]${nc} %s\n" "$1"
}

log_error() {
  printf "${red}[ERROR]${nc} %s\n" "$1"
}

# 检查命令是否存在
check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "$1 未安装，请先安装 $1"
    exit 1
  fi
}

# 下载文件
download_file() {
  url="$1"
  output="$2"
  if [ -f "$output" ]; then
    log_warn "$output 已存在，跳过下载"
  else
    log_info "下载 $output ..."
    curl -fsSL "$url" -o "$output"
  fi
}

# 检查 .env 关键配置
validate_env() {
  if [ ! -f ".env" ]; then
    return
  fi

  git_runner_secret=""
  agent_secret=""
  web_password=""
  ssh_host=""
  ssh_git_path=""

  # 读取 .env 中的值
  if grep -qE '^GIT_RUNNER_SECRET=' .env; then
    git_runner_secret=$(grep -E '^GIT_RUNNER_SECRET=' .env | tail -n 1 | cut -d'=' -f2- | sed 's/[[:space:]]*#.*$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  fi
  if grep -qE '^AGENT_SECRET=' .env; then
    agent_secret=$(grep -E '^AGENT_SECRET=' .env | tail -n 1 | cut -d'=' -f2- | sed 's/[[:space:]]*#.*$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  fi
  if grep -qE '^WEB_PASSWORD=' .env; then
    web_password=$(grep -E '^WEB_PASSWORD=' .env | tail -n 1 | cut -d'=' -f2- | sed 's/[[:space:]]*#.*$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  fi
  if grep -qE '^SSH_HOST=' .env; then
    ssh_host=$(grep -E '^SSH_HOST=' .env | tail -n 1 | cut -d'=' -f2- | sed 's/[[:space:]]*#.*$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  fi
  if grep -qE '^SSH_GIT_PATH=' .env; then
    ssh_git_path=$(grep -E '^SSH_GIT_PATH=' .env | tail -n 1 | cut -d'=' -f2- | sed 's/[[:space:]]*#.*$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  fi

  has_error=0

  if [ "$git_runner_secret" = "change-me-to-a-random-string" ] || [ -z "$git_runner_secret" ]; then
    log_warn "GIT_RUNNER_SECRET 未修改，建议设置为随机字符串（如: openssl rand -hex 32）"
    has_error=1
  fi

  if [ "$agent_secret" = "change-me-to-another-random-string" ] || [ -z "$agent_secret" ]; then
    log_warn "AGENT_SECRET 未修改，建议设置为随机字符串"
    has_error=1
  fi

  if [ -z "$web_password" ]; then
    log_warn "WEB_PASSWORD 为空，Web 界面将没有密码保护"
  fi

  if [ -z "$ssh_host" ]; then
    log_warn "SSH_HOST 未设置，SSH Clone URL 可能显示不正确"
    has_error=1
  fi

  if [ -z "$ssh_git_path" ]; then
    log_warn "SSH_GIT_PATH 未设置，SSH Clone URL 可能显示不正确"
    has_error=1
  fi

  if [ "$has_error" -eq 1 ]; then
    printf "\n"
    log_warn "检测到 .env 中有未完善或默认值的配置项"
    printf "是否继续部署？ (y/N): "
    read -r confirm
    case "$confirm" in
      [Yy]*)
        log_info "继续部署..."
        ;;
      *)
        log_info "已取消部署。请修改 .env 后重新运行脚本。"
        exit 0
        ;;
    esac
  fi
}

# =================== 主流程 ===================

log_info "Git Nest 一键部署脚本"

# 检查依赖
check_command docker
check_command curl

# 检查是否在项目根目录或需要下载文件
if [ -f "docker-compose.yml" ] && [ -f "scripts/init-host.sh" ]; then
  log_info "检测到当前目录已有部署文件，使用本地文件进行部署"
else
  log_info "未检测到本地部署文件，开始下载..."
  mkdir -p scripts
  download_file "$REPO_RAW/docker-compose.yml" "docker-compose.yml"
  download_file "$REPO_RAW/docker-compose.release.yml" "docker-compose.release.yml"
  download_file "$REPO_RAW/.env.example" ".env.example"
  download_file "$REPO_RAW/scripts/init-host.sh" "scripts/init-host.sh"
  chmod +x scripts/init-host.sh
fi

# 准备 .env
if [ ! -f ".env" ]; then
  log_info "复制 .env.example 为 .env"
  cp .env.example .env
  log_warn "已生成 .env，请修改必要配置后再继续"
  log_warn "至少要修改: PUID/PGID、GIT_RUNNER_SECRET、AGENT_SECRET、WEB_PASSWORD、SSH_HOST、SSH_GIT_PATH"
  exit 0
fi

# 校验 .env
validate_env

# 初始化宿主目录
log_info "执行 init-host.sh ..."
sh scripts/init-host.sh

# 拉取镜像并启动
log_info "拉取最新镜像..."
docker compose -f docker-compose.yml -f docker-compose.release.yml pull

log_info "启动服务..."
docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --no-build

log_info "部署完成！"
log_info "Web 界面地址: http://<your-host>:3000"
