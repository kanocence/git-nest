package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// workspacePath 返回工作目录的完整路径。
func workspacePath(workspaceDir, name string) string {
	return filepath.Join(workspaceDir, name)
}

// WorkspaceStatus 工作目录状态。
type WorkspaceStatus struct {
	Exists bool   `json:"exists"`
	Path   string `json:"path"`
}

// getWorkspaceStatus 检查工作目录是否存在。
func getWorkspaceStatus(workspaceDir, name string) WorkspaceStatus {
	wsPath := workspacePath(workspaceDir, name)
	_, err := os.Stat(wsPath)
	return WorkspaceStatus{
		Exists: err == nil,
		Path:   wsPath,
	}
}

// cloneToWorkspace 将 bare repo clone 到 workspace 目录，通过 SSE 流式输出进度。
func cloneToWorkspace(ctx context.Context, sse *sseWriter, cfg *Config, name string) int {
	barePath := repoPath(cfg.DataDir, name)
	wsPath := workspacePath(cfg.WorkspaceDir, name)

	// 检查 bare repo 是否存在
	if _, err := os.Stat(barePath); os.IsNotExist(err) {
		sse.sendError("bare repository not found", -1)
		return -1
	}

	// 检查 workspace 是否已存在
	if _, err := os.Stat(wsPath); err == nil {
		sse.sendError(fmt.Sprintf("workspace directory already exists: %s", wsPath), -1)
		return -1
	}

	// 确保 workspace 父目录存在
	if err := os.MkdirAll(cfg.WorkspaceDir, 0755); err != nil {
		sse.sendError(fmt.Sprintf("failed to create workspace directory: %v", err), -1)
		return -1
	}

	// 使用较长的超时：clone 可能耗时较长
	timeout := cfg.CommandTimeout * 5
	if timeout < 5*time.Minute {
		timeout = 5 * time.Minute
	}

	sse.sendProgress(fmt.Sprintf("Cloning %s.git → %s", name, wsPath))

	exitCode := streamCommandWithTimeout(ctx, sse, timeout,
		"git", "clone", barePath, wsPath, "--progress",
	)

	if exitCode == 0 {
		sse.sendDone(0)
	} else {
		sse.sendDone(exitCode)
	}

	return exitCode
}

// pullInWorkspace 在 workspace 目录执行 git pull，通过 SSE 流式输出。
func pullInWorkspace(ctx context.Context, sse *sseWriter, cfg *Config, name string) int {
	wsPath := workspacePath(cfg.WorkspaceDir, name)

	// 检查 workspace 是否存在
	if _, err := os.Stat(wsPath); os.IsNotExist(err) {
		sse.sendError("workspace directory not found, clone first", -1)
		return -1
	}

	// 检查是否是 git 仓库
	gitDir := filepath.Join(wsPath, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		sse.sendError("workspace is not a git repository", -1)
		return -1
	}

	sse.sendProgress(fmt.Sprintf("Pulling in %s", wsPath))

	exitCode := streamCommandWithTimeout(ctx, sse, cfg.CommandTimeout,
		"git", "-C", wsPath, "pull", "--progress",
	)

	if exitCode == 0 {
		sse.sendDone(0)
	} else {
		sse.sendDone(exitCode)
	}

	return exitCode
}
