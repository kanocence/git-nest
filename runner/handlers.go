package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strconv"
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

		if err := deleteBareRepo(cfg.DataDir, name); err != nil {
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

		commits, err := getRepoLog(r.Context(), cfg.DataDir, name, limit, cfg.CommandTimeout)
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

// handleTriggerBackup 手动触发全量备份。
func handleTriggerBackup(cfg *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		results, failed, err := backupAllRepos(r.Context(), cfg)
		if err != nil {
			slog.Error("manual backup failed", "error", err)
			writeError(w, http.StatusInternalServerError, "BACKUP_FAILED", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"message":   "backup completed",
			"succeeded": len(results),
			"failed":    failed,
			"backups":   results,
		})
	}
}
