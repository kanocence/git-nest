package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// AuditEntry 审计日志条目。
type AuditEntry struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Repo      string `json:"repo,omitempty"`
	Remote    string `json:"remote,omitempty"`
	Status    int    `json:"status"`
	Detail    string `json:"detail,omitempty"`
}

// AuditLogger 写入结构化审计日志文件。
type AuditLogger struct {
	mu   sync.Mutex
	file *os.File
}

// newAuditLogger 创建审计日志记录器。
// 日志文件存放在 <dataDir>/logs/audit.jsonl
func newAuditLogger(dataDir string) *AuditLogger {
	logDir := filepath.Join(dataDir, "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		slog.Warn("failed to create audit log directory", "path", logDir, "error", err)
		return &AuditLogger{} // 降级：不写日志文件
	}

	logPath := filepath.Join(logDir, "audit.jsonl")
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		slog.Warn("failed to open audit log file", "path", logPath, "error", err)
		return &AuditLogger{}
	}

	slog.Info("audit log enabled", "path", logPath)
	return &AuditLogger{file: f}
}

// Log 记录一条审计日志。
func (a *AuditLogger) Log(action, repo, remote string, status int, detail string) {
	entry := AuditEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Action:    action,
		Repo:      repo,
		Remote:    remote,
		Status:    status,
		Detail:    detail,
	}

	// 始终输出到 slog
	slog.Info("audit",
		"action", action,
		"repo", repo,
		"remote", remote,
		"status", status,
	)

	if a.file == nil {
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	data, err := json.Marshal(entry)
	if err != nil {
		slog.Warn("audit marshal failed", "error", err)
		return
	}

	if _, err := fmt.Fprintf(a.file, "%s\n", data); err != nil {
		slog.Warn("audit write failed", "error", err)
	}
}

// Close 关闭日志文件。
func (a *AuditLogger) Close() {
	if a.file != nil {
		a.file.Close()
	}
}
