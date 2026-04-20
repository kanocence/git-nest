#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-.env}"

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
  update_env() {
    key="$1"
    value="$2"
    tmp_file="${ENV_FILE}.tmp.$$"
    if grep -q "^${key}=" "$ENV_FILE"; then
      awk -v key="$key" -v value="$value" '
        $0 ~ "^" key "=" { print key "=" value; next }
        { print }
      ' "$ENV_FILE" > "$tmp_file"
    else
      cp "$ENV_FILE" "$tmp_file"
      printf '%s=%s\n' "$key" "$value" >> "$tmp_file"
    fi
    mv "$tmp_file" "$ENV_FILE"
  }

  update_env HERMES_HOST_WORKSPACE_DIR "$HERMES_HOST_WORKSPACE_DIR"
  update_env HERMES_HOST_AGENT_STATE_DIR "$HERMES_HOST_AGENT_STATE_DIR"
  update_env HERMES_HOST_DATA_DIR "$HERMES_HOST_DATA_DIR"
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

printf 'Initialized Git Nest data directories for %s:%s\n' "$PUID" "$PGID"
