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
BACKUP_DIR="${BACKUP_DIR:-$(read_env BACKUP_DIR ./data/backups)}"

mkdir -p "$GIT_DATA_DIR" "$GIT_WORKSPACE_DIR" "$AGENT_STATE_DIR" "$BACKUP_DIR"
mkdir -p "$AGENT_STATE_DIR/home/.goose" "$AGENT_STATE_DIR/cache"

chown "$PUID:$PGID" \
  "$GIT_DATA_DIR" \
  "$GIT_WORKSPACE_DIR" \
  "$AGENT_STATE_DIR" \
  "$AGENT_STATE_DIR/home" \
  "$AGENT_STATE_DIR/home/.goose" \
  "$AGENT_STATE_DIR/cache" \
  "$BACKUP_DIR"
chmod 2775 \
  "$GIT_DATA_DIR" \
  "$GIT_WORKSPACE_DIR" \
  "$AGENT_STATE_DIR" \
  "$AGENT_STATE_DIR/home" \
  "$AGENT_STATE_DIR/home/.goose" \
  "$AGENT_STATE_DIR/cache" \
  "$BACKUP_DIR"

printf 'Initialized Git Nest data directories for %s:%s\n' "$PUID" "$PGID"
