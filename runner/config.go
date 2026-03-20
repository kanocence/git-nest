package main

import (
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration loaded from environment variables.
type Config struct {
	DataDir        string        // Bare repo 目录 (default: /data/git)
	WorkspaceDir   string        // 工作目录 (default: /data/workspace)
	APISecret      string        // 认证密钥 (空 = 跳过认证，仅限开发)
	Port           int           // 监听端口 (default: 3001)
	CommandTimeout time.Duration // 命令执行超时 (default: 30s)

	// 备份相关
	BackupDir          string // 备份目录 (默认: /data/backups, 空 = 禁用定时备份)
	BackupRetentionDays int   // 备份保留天数 (default: 7)
	BackupScheduleHour  int   // 定时备份小时 (default: 3, 即凌晨3点)
}

func loadConfig() *Config {
	port := 3001
	if p, err := strconv.Atoi(os.Getenv("PORT")); err == nil && p > 0 {
		port = p
	}

	timeout := 30 * time.Second
	if t, err := strconv.Atoi(os.Getenv("COMMAND_TIMEOUT")); err == nil && t > 0 {
		timeout = time.Duration(t) * time.Second
	}

	retentionDays := 7
	if d, err := strconv.Atoi(os.Getenv("BACKUP_RETENTION_DAYS")); err == nil && d > 0 {
		retentionDays = d
	}

	scheduleHour := 3
	if h, err := strconv.Atoi(os.Getenv("BACKUP_SCHEDULE_HOUR")); err == nil && h >= 0 && h <= 23 {
		scheduleHour = h
	}

	return &Config{
		DataDir:             envOrDefault("GIT_DATA_DIR", "/data/git"),
		WorkspaceDir:        envOrDefault("GIT_WORKSPACE_DIR", "/data/workspace"),
		APISecret:           os.Getenv("API_SECRET"),
		Port:                port,
		CommandTimeout:      timeout,
		BackupDir:           envOrDefault("BACKUP_DIR", "/data/backups"),
		BackupRetentionDays: retentionDays,
		BackupScheduleHour:  scheduleHour,
	}
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
