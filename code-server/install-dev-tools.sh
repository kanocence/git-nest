#!/bin/bash
# ============================================
# Git Nest — code-server 开发工具状态检测
# ============================================

echo "[dev-tools] Checking environment tools..."

# pnpm 数据目录配置
if command -v pnpm &> /dev/null; then
  pnpm config set store-dir /config/.pnpm-store
fi

echo "[dev-tools] Environment Ready:"
echo "  git:  $(git --version 2>/dev/null || echo 'FAILED')"
echo "  node: $(node --version 2>/dev/null || echo 'FAILED')"
echo "  npm:  $(npm --version 2>/dev/null || echo 'FAILED')"
echo "  pnpm: $(pnpm --version 2>/dev/null || echo 'FAILED')"
