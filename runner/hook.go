package main

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// hookScript 是 post-receive hook 的模板。
// 收到 push 后，通过 HTTP 调用 git-runner 的 /api/internal/events 端点通知。
// API_SECRET 通过环境变量传入，避免硬编码在 hook 文件中。
const hookScriptTemplate = `#!/bin/sh
# Git Nest post-receive hook — auto-installed
# 通知 git-runner 有新的 push 事件

REPO_NAME="{{.RepoName}}"
RUNNER_URL="http://localhost:{{.Port}}"

# 读取 stdin 获取 ref 信息
while read oldrev newrev refname; do
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${API_SECRET}" \
    -d "{\"repo\":\"${REPO_NAME}\",\"ref\":\"${refname}\",\"oldrev\":\"${oldrev}\",\"newrev\":\"${newrev}\"}" \
    "${RUNNER_URL}/api/internal/events" > /dev/null 2>&1 &
done
`

// hookTemplateParsed 预编译的 hook 模板。
var hookTemplateParsed = template.Must(template.New("hook").Parse(hookScriptTemplate))

type hookTemplateData struct {
	RepoName string
	Port     int
}

// installPostReceiveHook 为指定 bare repo 安装 post-receive hook。
func installPostReceiveHook(cfg *Config, repoName string) error {
	barePath := repoPath(cfg.DataDir, repoName)
	hooksDir := filepath.Join(barePath, "hooks")
	hookPath := filepath.Join(hooksDir, "post-receive")

	// 确保 hooks 目录存在
	if err := os.MkdirAll(hooksDir, 0755); err != nil {
		return fmt.Errorf("create hooks dir: %w", err)
	}

	// 生成 hook 脚本
	f, err := os.OpenFile(hookPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return fmt.Errorf("create hook file: %w", err)
	}
	defer f.Close()

	data := hookTemplateData{
		RepoName: repoName,
		Port:     cfg.Port,
	}

	if err := hookTemplateParsed.Execute(f, data); err != nil {
		return fmt.Errorf("render hook template: %w", err)
	}

	slog.Info("post-receive hook installed", "repo", repoName, "path", hookPath)
	return nil
}

// uninstallPostReceiveHook 移除指定 repo 的 post-receive hook。
func uninstallPostReceiveHook(cfg *Config, repoName string) error {
	hookPath := filepath.Join(repoPath(cfg.DataDir, repoName), "hooks", "post-receive")

	if err := os.Remove(hookPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove hook: %w", err)
	}

	slog.Info("post-receive hook removed", "repo", repoName)
	return nil
}

// getHookStatus 检查 hook 是否已安装。
func getHookStatus(cfg *Config, repoName string) (installed bool, content string) {
	hookPath := filepath.Join(repoPath(cfg.DataDir, repoName), "hooks", "post-receive")

	data, err := os.ReadFile(hookPath)
	if err != nil {
		return false, ""
	}

	return true, string(data)
}

// installHooksForAll 为所有已存在的 bare repo 安装 hook（启动时调用）。
func installHooksForAll(cfg *Config) {
	repos, err := listRepos(cfg.DataDir)
	if err != nil {
		slog.Warn("failed to list repos for hook installation", "error", err)
		return
	}

	installed := 0
	for _, repo := range repos {
		hookPath := filepath.Join(repo.Path, "hooks", "post-receive")
		data, err := os.ReadFile(hookPath)
		// 只安装尚无 hook 或 hook 内容包含 "Git Nest" 标记的（允许覆盖旧版本）
		if err != nil || strings.Contains(string(data), "Git Nest") {
			if err := installPostReceiveHook(cfg, repo.Name); err != nil {
				slog.Warn("failed to install hook", "repo", repo.Name, "error", err)
			} else {
				installed++
			}
		}
	}

	if installed > 0 {
		slog.Info("post-receive hooks installed", "count", installed)
	}
}
