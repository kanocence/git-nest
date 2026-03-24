package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// BackupInfo 单个备份文件信息。
type BackupInfo struct {
	Repo      string    `json:"repo"`
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
}

// backupDir 返回备份根目录。
func backupDir(cfg *Config) string {
	return cfg.BackupDir
}

// bundleRepo 对单个 bare repo 执行 git bundle，保存到备份目录。
func bundleRepo(ctx context.Context, cfg *Config, repoName string, timeout time.Duration) (*BackupInfo, error) {
	barePath := repoPath(cfg.DataDir, repoName)

	if _, err := os.Stat(barePath); os.IsNotExist(err) {
		return nil, &AppError{Code: "REPO_NOT_FOUND", Message: "repository not found"}
	}

	// 确保备份目录存在
	dir := backupDir(cfg)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create backup dir: %w", err)
	}

	// 文件名: <repo>_<timestamp>.bundle
	ts := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("%s_%s.bundle", repoName, ts)
	outputPath := filepath.Join(dir, filename)

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "--git-dir", barePath, "bundle", "create", outputPath, "--all")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("git bundle failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	info, err := os.Stat(outputPath)
	if err != nil {
		return nil, fmt.Errorf("stat bundle: %w", err)
	}

	return &BackupInfo{
		Repo:      repoName,
		Filename:  filename,
		Size:      info.Size(),
		CreatedAt: time.Now(),
	}, nil
}

// listBackups 列出备份目录中所有 .bundle 文件。
func listBackups(cfg *Config) ([]BackupInfo, error) {
	dir := backupDir(cfg)

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return []BackupInfo{}, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read backup dir: %w", err)
	}

	backups := make([]BackupInfo, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".bundle") {
			continue
		}

		info, err := e.Info()
		if err != nil {
			continue
		}

		// 解析 repo 名: <repo>_<timestamp>.bundle
		name := strings.TrimSuffix(e.Name(), ".bundle")
		parts := strings.Split(name, "_")
		repoName := ""
		if len(parts) >= 2 {
			repoName = strings.Join(parts[:len(parts)-1], "_")
		}

		backups = append(backups, BackupInfo{
			Repo:      repoName,
			Filename:  e.Name(),
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
		})
	}

	// 按时间倒序
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})

	return backups, nil
}

// cleanOldBackups 清理超过保留天数的备份文件。
func cleanOldBackups(cfg *Config) (int, error) {
	dir := backupDir(cfg)

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return 0, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, fmt.Errorf("read backup dir: %w", err)
	}

	cutoff := time.Now().AddDate(0, 0, -cfg.BackupRetentionDays)
	removed := 0

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".bundle") {
			continue
		}

		info, err := e.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			path := filepath.Join(dir, e.Name())
			if err := os.Remove(path); err != nil {
				slog.Warn("failed to remove old backup", "path", path, "error", err)
			} else {
				removed++
				slog.Info("removed old backup", "file", e.Name())
			}
		}
	}

	return removed, nil
}

// backupAllRepos 并发备份所有 bare repo。
func backupAllRepos(ctx context.Context, cfg *Config) ([]BackupInfo, int, error) {
	repos, err := listRepos(cfg.DataDir)
	if err != nil {
		return nil, 0, fmt.Errorf("list repos: %w", err)
	}

	if len(repos) == 0 {
		return []BackupInfo{}, 0, nil
	}

	// 限制最大并发数，避免同时打开过多 git 进程
	const maxConcurrent = 4
	sem := make(chan struct{}, maxConcurrent)

	var (
		mu       sync.Mutex
		results  = make([]BackupInfo, 0, len(repos))
		failed   int
		wg       sync.WaitGroup
		errChan  = make(chan error, len(repos))
	)

	for _, repo := range repos {
		wg.Add(1)
		go func(repo RepoInfo) {
			defer wg.Done()

			// 获取信号量
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				errChan <- ctx.Err()
				return
			}

			timeout := cfg.CommandTimeout * 5
			if timeout < 5*time.Minute {
				timeout = 5 * time.Minute
			}

			info, err := bundleRepo(ctx, cfg, repo.Name, timeout)
			if err != nil {
				slog.Error("backup failed", "repo", repo.Name, "error", err)
				mu.Lock()
				failed++
				mu.Unlock()
				return
			}

			slog.Info("backup completed", "repo", repo.Name, "file", info.Filename, "size", info.Size)
			mu.Lock()
			results = append(results, *info)
			mu.Unlock()
		}(repo)
	}

	wg.Wait()
	close(errChan)

	// 清理旧备份
	cleaned, err := cleanOldBackups(cfg)
	if err != nil {
		slog.Warn("cleanup failed", "error", err)
	} else if cleaned > 0 {
		slog.Info("old backups cleaned", "count", cleaned)
	}

	return results, failed, nil
}

// startBackupScheduler 启动定时备份调度器。
// 每天在指定的小时运行（默认凌晨 3 点）。
func startBackupScheduler(ctx context.Context, cfg *Config) {
	if cfg.BackupDir == "" {
		slog.Info("backup disabled (no backup dir configured)")
		return
	}

	slog.Info("backup scheduler started",
		"backupDir", cfg.BackupDir,
		"retentionDays", cfg.BackupRetentionDays,
		"scheduleHour", cfg.BackupScheduleHour,
	)

	go func() {
		for {
			now := time.Now()
			// 计算下一次运行时间
			next := time.Date(now.Year(), now.Month(), now.Day(), cfg.BackupScheduleHour, 0, 0, 0, now.Location())
			if next.Before(now) {
				next = next.Add(24 * time.Hour)
			}

			waitDuration := time.Until(next)
			slog.Info("next backup scheduled", "at", next.Format(time.RFC3339), "in", waitDuration.Round(time.Minute))

			select {
			case <-ctx.Done():
				slog.Info("backup scheduler stopped")
				return
			case <-time.After(waitDuration):
				slog.Info("scheduled backup starting")
				results, failed, err := backupAllRepos(ctx, cfg)
				if err != nil {
					slog.Error("scheduled backup error", "error", err)
				} else {
					slog.Info("scheduled backup completed",
						"total", len(results),
						"failed", failed,
					)
				}
				// 更新 now 为当前时间，确保下次计算基于实际完成时间
				now = time.Now()
			}
		}
	}()
}
