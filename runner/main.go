package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg := loadConfig()

	// 结构化 JSON 日志
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// 确保数据目录存在
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		slog.Error("failed to create data directory", "path", cfg.DataDir, "error", err)
		os.Exit(1)
	}

	// 确保 workspace 目录存在
	if err := os.MkdirAll(cfg.WorkspaceDir, 0755); err != nil {
		slog.Error("failed to create workspace directory", "path", cfg.WorkspaceDir, "error", err)
		os.Exit(1)
	}

	// 确保备份目录存在
	if cfg.BackupDir != "" {
		if err := os.MkdirAll(cfg.BackupDir, 0755); err != nil {
			slog.Error("failed to create backup directory", "path", cfg.BackupDir, "error", err)
			os.Exit(1)
		}
	}

	// 事件总线（push 通知）
	bus := newEventBus()

	// 审计日志
	audit := newAuditLogger(cfg.DataDir)
	defer audit.Close()

	// 为所有已有 repo 安装 post-receive hook
	installHooksForAll(cfg)

	// 路由注册（Go 1.22+ 增强型 ServeMux）
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handleHealth(cfg))
	mux.HandleFunc("GET /api/repos", handleListRepos(cfg))
	mux.HandleFunc("POST /api/repos", handleCreateRepo(cfg))
	mux.HandleFunc("GET /api/repos/{name}/log", handleRepoLog(cfg))
	mux.HandleFunc("DELETE /api/repos/{name}", handleDeleteRepo(cfg))
	mux.HandleFunc("POST /api/repos/{name}/clone", handleCloneRepo(cfg))
	mux.HandleFunc("POST /api/repos/{name}/pull", handlePullRepo(cfg))
	mux.HandleFunc("GET /api/repos/{name}/workspace", handleWorkspaceStatus(cfg))
	mux.HandleFunc("GET /api/repos/{name}/branches", handleListBranches(cfg))
	mux.HandleFunc("GET /api/repos/{name}/archive", handleArchiveRepo(cfg))

	// Hook 管理
	mux.HandleFunc("GET /api/repos/{name}/hooks", handleGetHookStatus(cfg))
	mux.HandleFunc("POST /api/repos/{name}/hooks", handleInstallHook(cfg))
	mux.HandleFunc("DELETE /api/repos/{name}/hooks", handleUninstallHook(cfg))

	// 推送事件
	mux.HandleFunc("POST /api/internal/events", handleInternalEvent(bus))
	mux.HandleFunc("GET /api/events", handleEvents(bus))

	// 备份
	mux.HandleFunc("GET /api/backups", handleListBackups(cfg))
	mux.HandleFunc("POST /api/backups", handleTriggerBackup(cfg))

	// 中间件链：logging → auth → audit → router
	handler := loggingMiddleware(authMiddleware(cfg.APISecret, auditMiddleware(audit, mux)))

	// 启动定时备份调度器
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	startBackupScheduler(ctx, cfg)

	addr := fmt.Sprintf(":%d", cfg.Port)
	slog.Info("git-runner starting",
		"addr", addr,
		"dataDir", cfg.DataDir,
		"workspaceDir", cfg.WorkspaceDir,
		"backupDir", cfg.BackupDir,
		"authEnabled", cfg.APISecret != "",
	)

	srv := &http.Server{Addr: addr, Handler: handler}

	// 优雅退出
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		slog.Info("shutting down", "signal", sig.String())
		cancel()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("shutdown error", "error", err)
		}
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped")
}
