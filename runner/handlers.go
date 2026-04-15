package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// --- JSON 响应工具 ---

// ErrorResponse 统一错误响应格式。
type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, ErrorResponse{Error: message, Code: code})
}

// DiskUsage 磁盘使用信息。
type DiskUsage struct {
	Path       string  `json:"path"`
	TotalBytes uint64  `json:"totalBytes"`
	FreeBytes  uint64  `json:"freeBytes"`
	UsedBytes  uint64  `json:"usedBytes"`
	UsedPct    float64 `json:"usedPct"`
}

// --- Handlers ---

// handleHealth 健康检查，不需要认证（供 Docker healthcheck 调用）。
func handleHealth(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 检查数据目录是否可访问
		if _, err := os.Stat(cfg.DataDir); err != nil {
			writeError(w, http.StatusServiceUnavailable, "DATA_DIR_INACCESSIBLE",
				"data directory is not accessible: "+cfg.DataDir)
			return
		}

		// 检查 workspace 目录是否可访问
		if _, err := os.Stat(cfg.WorkspaceDir); err != nil {
			writeError(w, http.StatusServiceUnavailable, "WORKSPACE_DIR_INACCESSIBLE",
				"workspace directory is not accessible: "+cfg.WorkspaceDir)
			return
		}

		// 检查 git 是否可用
		if _, err := exec.LookPath("git"); err != nil {
			writeError(w, http.StatusServiceUnavailable, "GIT_NOT_FOUND",
				"git executable not found in PATH")
			return
		}

		// 磁盘使用信息
		disk, diskErr := getDiskUsage(cfg.DataDir)
		if diskErr != nil {
			slog.Warn("disk usage check failed", "error", diskErr)
		}

		result := map[string]any{
			"status": "ok",
		}

		if disk != nil {
			result["disk"] = disk
			// 磁盘使用超过 90% 发出警告
			if disk.UsedPct > 90 {
				result["status"] = "warning"
				result["warning"] = "disk usage above 90%"
			}
		}

		writeJSON(w, http.StatusOK, result)
	}
}

// handleListRepos 列出所有 bare 仓库。
func handleListRepos(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		repos, err := listRepos(cfg.DataDir)
		if err != nil {
			slog.Error("list repos failed", "error", err)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"repos": repos,
			"total": len(repos),
		})
	}
}

// handleCreateRepo 创建新的 bare 仓库。
func handleCreateRepo(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB limit
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		if err := validateRepoName(body.Name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		// 获取 per-repo 锁
		unlock := repoLock(body.Name)
		defer unlock()

		if err := createBareRepo(r.Context(), cfg.DataDir, body.Name, cfg.CommandTimeout); err != nil {
			var appErr *AppError
			if errors.As(err, &appErr) {
				writeError(w, http.StatusConflict, appErr.Code, appErr.Message)
				return
			}
			slog.Error("create repo failed", "name", body.Name, "error", err)
			writeError(w, http.StatusInternalServerError, "COMMAND_FAILED", err.Error())
			return
		}

		slog.Info("repo created", "name", body.Name)

		// 自动安装 post-receive hook
		if err := installPostReceiveHook(cfg, body.Name); err != nil {
			slog.Warn("auto hook install failed", "repo", body.Name, "error", err)
		}

		writeJSON(w, http.StatusCreated, map[string]string{
			"name":    body.Name,
			"message": "repository created",
		})
	}
}

// handleDeleteRepo 删除 bare 仓库。
func handleDeleteRepo(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		// 获取 per-repo 锁
		unlock := repoLock(name)
		defer unlock()

		if err := deleteBareRepo(cfg.DataDir, cfg.WorkspaceDir, name); err != nil {
			var appErr *AppError
			if errors.As(err, &appErr) {
				writeError(w, http.StatusNotFound, appErr.Code, appErr.Message)
				return
			}
			slog.Error("delete repo failed", "name", name, "error", err)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}

		slog.Info("repo deleted", "name", name)
		writeJSON(w, http.StatusOK, map[string]string{
			"name":    name,
			"message": "repository deleted",
		})
	}
}

// handleRepoLog 获取仓库提交日志。
// 支持 ?branch=xxx 参数指定分支，不指定则返回默认分支的日志。
func handleRepoLog(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		limit := 20
		if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
			limit = l
		}

		// 获取 branch 参数
		branch := r.URL.Query().Get("branch")

		// 直接在 bare repo 上获取日志
		commits, err := getRepoLog(r.Context(), cfg.DataDir, name, branch, limit, cfg.CommandTimeout)
		if err != nil {
			var appErr *AppError
			if errors.As(err, &appErr) {
				writeError(w, http.StatusNotFound, appErr.Code, appErr.Message)
				return
			}
			slog.Error("get repo log failed", "name", name, "error", err)
			writeError(w, http.StatusInternalServerError, "COMMAND_FAILED", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"repo":    name,
			"commits": commits,
			"total":   len(commits),
			"branch":  branch,
		})
	}
}

// handleCloneRepo 克隆 bare repo 到 workspace，通过 SSE 流式输出。
func handleCloneRepo(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		sse, err := newSSEWriter(w)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SSE_NOT_SUPPORTED", err.Error())
			return
		}

		// 获取 per-repo 锁
		unlock := repoLock(name)
		defer unlock()

		slog.Info("clone started", "name", name)
		cloneToWorkspace(r.Context(), sse, cfg, name)
		slog.Info("clone finished", "name", name)
	}
}

// handlePullRepo 在 workspace 目录执行 git pull，通过 SSE 流式输出。
func handlePullRepo(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		sse, err := newSSEWriter(w)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SSE_NOT_SUPPORTED", err.Error())
			return
		}

		// 获取 per-repo 锁
		unlock := repoLock(name)
		defer unlock()

		slog.Info("pull started", "name", name)
		pullInWorkspace(r.Context(), sse, cfg, name)
		slog.Info("pull finished", "name", name)
	}
}

// handleWorkspaceStatus 获取 workspace 状态。
func handleWorkspaceStatus(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		status := getWorkspaceStatus(cfg.WorkspaceDir, name)
		writeJSON(w, http.StatusOK, status)
	}
}

// handleDeleteBranch 删除 bare repo 的一个本地分支。
func handleDeleteBranch(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var body struct {
			Branch string `json:"branch"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
			return
		}
		if body.Branch == "" {
			writeError(w, http.StatusBadRequest, "BRANCH_REQUIRED", "branch is required")
			return
		}

		unlock := repoLock(name)
		defer unlock()

		if err := deleteBranch(r.Context(), cfg.DataDir, name, body.Branch, cfg.CommandTimeout); err != nil {
			var appErr *AppError
			if errors.As(err, &appErr) {
				status := http.StatusNotFound
				if appErr.Code == "INVALID_BRANCH" {
					status = http.StatusBadRequest
				} else if appErr.Code == "BRANCH_LOCKED" {
					status = http.StatusConflict
				}
				writeError(w, status, appErr.Code, appErr.Message)
				return
			}
			slog.Error("delete branch failed", "name", name, "branch", body.Branch, "error", err)
			writeError(w, http.StatusInternalServerError, "COMMAND_FAILED", err.Error())
			return
		}

		slog.Info("branch deleted", "name", name, "branch", body.Branch)
		writeJSON(w, http.StatusOK, map[string]string{
			"name":    name,
			"branch":  body.Branch,
			"message": "branch deleted",
		})
	}
}

// handleListBranches 列出 bare repo 的分支。
func handleListBranches(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		barePath := repoPath(cfg.DataDir, name)
		if _, err := os.Stat(barePath); os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "REPO_NOT_FOUND", "repository not found")
			return
		}

		branches, err := listBranches(r.Context(), barePath, cfg.CommandTimeout)
		if err != nil {
			slog.Error("list branches failed", "name", name, "error", err)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"repo":     name,
			"branches": branches,
		})
	}
}

// --- Hook 管理 ---

// handleGetHookStatus 查看 hook 安装状态。
func handleGetHookStatus(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		installed, _ := getHookStatus(cfg, name)
		writeJSON(w, http.StatusOK, map[string]any{
			"repo":      name,
			"installed": installed,
		})
	}
}

// handleInstallHook 为仓库安装 post-receive hook。
func handleInstallHook(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		if err := installPostReceiveHook(cfg, name); err != nil {
			slog.Error("install hook failed", "repo", name, "error", err)
			writeError(w, http.StatusInternalServerError, "HOOK_INSTALL_FAILED", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"repo":    name,
			"message": "post-receive hook installed",
		})
	}
}

// handleUninstallHook 移除仓库的 post-receive hook。
func handleUninstallHook(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		if err := uninstallPostReceiveHook(cfg, name); err != nil {
			slog.Error("uninstall hook failed", "repo", name, "error", err)
			writeError(w, http.StatusInternalServerError, "HOOK_UNINSTALL_FAILED", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"repo":    name,
			"message": "post-receive hook removed",
		})
	}
}

// --- 备份管理 ---

// handleListBackups 列出所有备份。
func handleListBackups(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		backups, err := listBackups(cfg)
		if err != nil {
			slog.Error("list backups failed", "error", err)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"backups": backups,
			"total":   len(backups),
		})
	}
}

// handleTriggerBackup 手动触发全量备份（异步）。
func handleTriggerBackup(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 立即返回 202，备份在后台 goroutine 中执行
		writeJSON(w, http.StatusAccepted, map[string]any{
			"message": "backup started in background",
		})

		// 使用独立的 context，确保备份不因客户端断开而取消
		go func() {
			ctx := context.Background()
			results, failed, err := backupAllRepos(ctx, cfg)
			if err != nil {
				slog.Error("background backup failed", "error", err)
				return
			}
			slog.Info("background backup finished", "succeeded", len(results), "failed", failed)
		}()
	}
}

// handleArchiveRepo 打包仓库指定分支为 zip 并流式返回。
func handleArchiveRepo(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if err := validateRepoName(name); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REPO_NAME", err.Error())
			return
		}

		barePath := repoPath(cfg.DataDir, name)
		if _, err := os.Stat(barePath); os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "REPO_NOT_FOUND", "repository not found")
			return
		}

		branch := r.URL.Query().Get("branch")
		if branch == "" {
			// 读取默认分支
			headData, err := os.ReadFile(filepath.Join(barePath, "HEAD"))
			if err != nil {
				writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to read HEAD")
				return
			}
			headStr := strings.TrimSpace(string(headData))
			if strings.HasPrefix(headStr, "ref: refs/heads/") {
				branch = strings.TrimPrefix(headStr, "ref: refs/heads/")
			} else {
				branch = "HEAD"
			}
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.CommandTimeout)
		defer cancel()

		// 先校验分支是否存在（rev-parse 在空仓库上也会失败，需区分）
		verifyCmd := exec.CommandContext(ctx, "git", "--git-dir", barePath, "rev-parse", "--verify", "refs/heads/"+branch)
		if verifyErr := verifyCmd.Run(); verifyErr != nil {
			// 检查是否为空仓库（无 commit）：--all 在空仓库返回 "0"，HEAD 在空仓库本身也会出错
			countCmd := exec.CommandContext(ctx, "git", "--git-dir", barePath, "rev-list", "--count", "--all")
			countOut, countErr := countCmd.CombinedOutput()
			if countErr == nil {
				count := strings.TrimSpace(string(countOut))
				if count == "0" {
					writeError(w, http.StatusNotFound, "REPO_EMPTY", "repository has no commits")
					return
				}
			}
			writeError(w, http.StatusNotFound, "BRANCH_NOT_FOUND", "branch '"+branch+"' not found")
			return
		}

		// 设置响应头
		filename := sanitizeFilename(name + "-" + branch + ".zip")
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

		// git archive --format=zip 直接输出到 stdout，通过管道传给响应
		cmd := exec.CommandContext(ctx, "git", "--git-dir", barePath, "archive", "--format=zip", "-o", "-", branch)
		cmd.Stdout = w
		cmd.Stderr = nil

		if err := cmd.Run(); err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				slog.Warn("archive timeout", "name", name, "branch", branch)
			} else {
				slog.Error("git archive failed", "name", name, "branch", branch, "error", err)
			}
		}
	}
}

// sanitizeFilename 移除文件名中的非法字符。
func sanitizeFilename(name string) string {
	// Windows/NTFS 非法字符：< > : " | \ / * ?
	re := regexp.MustCompile(`[<>:"\\|?*/]`)
	return re.ReplaceAllString(name, "_")
}
