#!/usr/bin/env sh
set -eu

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/kanocence/git-nest/main}"
ENV_FILE="${ENV_FILE:-.env}"
CUSTOM_CODE_SERVER=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --custom-code-server)
      CUSTOM_CODE_SERVER=1
      shift
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      printf 'Usage: sh scripts/init-host.sh [--custom-code-server]\n' >&2
      exit 1
      ;;
  esac
done

read_env() {
  key="$1"
  default_value="$2"
  if [ -f "$ENV_FILE" ]; then
    line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
    if [ -n "$line" ]; then
      value="${line#*=}"
      value="$(printf '%s' "$value" | sed 's/[[:space:]]*#.*$//' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
      if [ -n "$value" ]; then
        printf '%s' "$value"
        return
      fi
    fi
  fi
  printf '%s' "$default_value"
}

update_env() {
  key="$1"
  value="$2"
  tmp_file="${ENV_FILE}.tmp.$$"
  if [ -f "$ENV_FILE" ] && grep -q "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v value="$value" '
      $0 ~ "^" key "=" { print key "=" value; next }
      { print }
    ' "$ENV_FILE" > "$tmp_file"
  else
    if [ -f "$ENV_FILE" ]; then
      cp "$ENV_FILE" "$tmp_file"
    else
      : > "$tmp_file"
    fi
    printf '%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi
  mv "$tmp_file" "$ENV_FILE"
}

expand_user_path() {
  raw_path="$1"
  case "$raw_path" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s/%s\n' "$HOME" "${raw_path#~/}"
      ;;
    *)
      printf '%s\n' "$raw_path"
      ;;
  esac
}

confirm_custom_code_server() {
  printf '\n'
  printf 'You are enabling custom code-server mode.\n' >&2
  printf 'Git Nest will create a user-owned code-server build directory.\n' >&2
  printf 'Future upgrades will not overwrite your custom files automatically.\n' >&2
  printf 'You are responsible for reviewing template changes and rebuilding the image.\n' >&2
  printf 'Continue? (y/N): ' >&2
  read -r confirm
  case "$confirm" in
    [Yy]*) ;;
    *) printf 'Custom code-server setup cancelled.\n' >&2; exit 0 ;;
  esac
}

copy_local_code_server_template() {
  target_dir="$1"
  mkdir -p "$target_dir"
  for file in Dockerfile install-dev-tools.sh; do
    if [ ! -f "$target_dir/$file" ]; then
      cp "code-server/$file" "$target_dir/$file"
    fi
  done
  chmod +x "$target_dir/install-dev-tools.sh"
}

download_code_server_template() {
  target_dir="$1"
  if ! command -v curl >/dev/null 2>&1; then
    printf 'curl is required to download the code-server template.\n' >&2
    exit 1
  fi
  mkdir -p "$target_dir"
  for file in Dockerfile install-dev-tools.sh; do
    if [ ! -f "$target_dir/$file" ]; then
      curl -fsSL "$REPO_RAW/code-server/$file" -o "$target_dir/$file"
    fi
  done
  chmod +x "$target_dir/install-dev-tools.sh"
}

setup_custom_code_server() {
  confirm_custom_code_server

  custom_dir_raw="${CODE_SERVER_CUSTOM_DIR:-$(read_env CODE_SERVER_CUSTOM_DIR "$HOME/.git-nest/code-server")}"
  custom_dir="$(expand_user_path "$custom_dir_raw")"
  mkdir -p "$custom_dir"
  custom_abs_dir="$(cd "$custom_dir" && pwd)"

  if [ -d "code-server" ] && [ -f "code-server/Dockerfile" ]; then
    copy_local_code_server_template "$custom_abs_dir"
  else
    download_code_server_template "$custom_abs_dir"
  fi

  chown -R "$PUID:$PGID" "$custom_abs_dir"
  chmod 2775 "$custom_abs_dir"

  update_env CODE_SERVER_CUSTOM_DIR "$custom_dir_raw"
  update_env CODE_SERVER_BUILD_CONTEXT "$custom_abs_dir"
  update_env GIT_NEST_CODE_SERVER_IMAGE "git-nest-code-server:custom"

  cat > docker-compose.custom-code-server.yml <<'EOF'
services:
  code-server:
    pull_policy: build
EOF

  printf 'Custom code-server directory: %s\n' "$custom_abs_dir"
  printf 'Edit Dockerfile or install-dev-tools.sh there, then rebuild code-server with Docker Compose.\n'
}

PUID="${PUID:-$(read_env PUID 1000)}"
PGID="${PGID:-$(read_env PGID 1000)}"
GIT_DATA_DIR="${GIT_DATA_DIR:-$(read_env GIT_DATA_DIR ./data/git)}"
GIT_WORKSPACE_DIR="${GIT_WORKSPACE_DIR:-$(read_env GIT_WORKSPACE_DIR ./data/workspace)}"
AGENT_STATE_DIR="${AGENT_STATE_DIR:-$(read_env AGENT_STATE_DIR ./data/agent-state)}"
HERMES_DATA_DIR="${HERMES_DATA_DIR:-$(read_env HERMES_DATA_DIR ./data/hermes)}"
BACKUP_DIR="${BACKUP_DIR:-$(read_env BACKUP_DIR ./data/backups)}"
HERMES_HOST_WORKSPACE_DIR="${HERMES_HOST_WORKSPACE_DIR:-$(read_env HERMES_HOST_WORKSPACE_DIR "$GIT_WORKSPACE_DIR")}"
HERMES_HOST_AGENT_STATE_DIR="${HERMES_HOST_AGENT_STATE_DIR:-$(read_env HERMES_HOST_AGENT_STATE_DIR "$AGENT_STATE_DIR")}"
HERMES_HOST_DATA_DIR="${HERMES_HOST_DATA_DIR:-$(read_env HERMES_HOST_DATA_DIR "$HERMES_DATA_DIR")}"

# Resolve HERMES_HOST_* paths to absolute paths (required by agent config)
resolve_abs_path() {
  rel_path="$1"
  mkdir -p "$rel_path"
  (cd "$rel_path" && pwd)
}

HERMES_HOST_WORKSPACE_DIR=$(resolve_abs_path "$HERMES_HOST_WORKSPACE_DIR")
HERMES_HOST_AGENT_STATE_DIR=$(resolve_abs_path "$HERMES_HOST_AGENT_STATE_DIR")
HERMES_HOST_DATA_DIR=$(resolve_abs_path "$HERMES_HOST_DATA_DIR")

# Update .env with resolved absolute paths so docker-compose passes them correctly
if [ -f "$ENV_FILE" ]; then
  update_env HERMES_HOST_WORKSPACE_DIR "$HERMES_HOST_WORKSPACE_DIR"
  update_env HERMES_HOST_AGENT_STATE_DIR "$HERMES_HOST_AGENT_STATE_DIR"
  update_env HERMES_HOST_DATA_DIR "$HERMES_HOST_DATA_DIR"
fi

current_uid=$(id -u)

# 非 root 用户：检查当前 UID 是否与 PUID 匹配
if [ "$current_uid" != "0" ] && [ "$current_uid" != "$PUID" ]; then
  printf 'Error: Current user UID is %s, but PUID=%s in .env\n' "$current_uid" "$PUID" >&2
  printf 'Please update .env: PUID=%s PGID=%s\n' "$current_uid" "$(id -g)" >&2
  exit 1
fi

# root 用户：如果系统存在 git 用户，检查其 UID 是否与 PUID 匹配
if [ "$current_uid" = "0" ] && command -v id >/dev/null 2>&1; then
  if id -u git >/dev/null 2>&1; then
    git_uid=$(id -u git)
    git_gid=$(id -g git)
    if [ "$git_uid" != "$PUID" ]; then
      printf 'Warning: git user UID is %s, but PUID=%s in .env\n' "$git_uid" "$PUID" >&2
      printf 'SSH push/pull will fail because the git user cannot write to data directories owned by UID %s.\n' "$PUID" >&2
      printf 'Fix: update .env to PUID=%s PGID=%s\n' "$git_uid" "$git_gid" >&2
      printf 'Continue anyway? (y/N): ' >&2
      read -r confirm
      case "$confirm" in
        [Yy]*) ;;
        *) exit 1 ;;
      esac
    fi
  fi
fi

mkdir -p "$GIT_DATA_DIR" "$GIT_WORKSPACE_DIR" "$AGENT_STATE_DIR" "$HERMES_DATA_DIR" "$BACKUP_DIR"
mkdir -p "$AGENT_STATE_DIR/home" "$AGENT_STATE_DIR/cache" "$AGENT_STATE_DIR/runs"
mkdir -p "$HERMES_HOST_WORKSPACE_DIR" "$HERMES_HOST_AGENT_STATE_DIR" "$HERMES_HOST_DATA_DIR"

chown "$PUID:$PGID" \
  "$GIT_DATA_DIR" \
  "$GIT_WORKSPACE_DIR" \
  "$AGENT_STATE_DIR" \
  "$AGENT_STATE_DIR/home" \
  "$AGENT_STATE_DIR/cache" \
  "$AGENT_STATE_DIR/runs" \
  "$HERMES_DATA_DIR" \
  "$BACKUP_DIR" \
  "$HERMES_HOST_WORKSPACE_DIR" \
  "$HERMES_HOST_AGENT_STATE_DIR" \
  "$HERMES_HOST_DATA_DIR"
chmod 2775 \
  "$GIT_DATA_DIR" \
  "$GIT_WORKSPACE_DIR" \
  "$AGENT_STATE_DIR" \
  "$AGENT_STATE_DIR/home" \
  "$AGENT_STATE_DIR/cache" \
  "$AGENT_STATE_DIR/runs" \
  "$HERMES_DATA_DIR" \
  "$BACKUP_DIR" \
  "$HERMES_HOST_WORKSPACE_DIR" \
  "$HERMES_HOST_AGENT_STATE_DIR" \
  "$HERMES_HOST_DATA_DIR"

if [ "$CUSTOM_CODE_SERVER" -eq 1 ]; then
  setup_custom_code_server
fi

printf 'Initialized Git Nest data directories for %s:%s\n' "$PUID" "$PGID"
