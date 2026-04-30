package main

import (
	"crypto/subtle"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// authMiddleware 验证 Authorization: Bearer <secret>。
// /health 路径跳过认证（供 Docker healthcheck 使用）。
// 如果 secret 为空则跳过认证（开发模式）。
func authMiddleware(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 健康检查不需要认证
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// 未配置密钥 = 开发模式，跳过认证
		if secret == "" {
			next.ServeHTTP(w, r)
			return
		}

		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED",
				"missing or invalid Authorization header")
			return
		}

		token := strings.TrimPrefix(auth, "Bearer ")
		if subtle.ConstantTimeCompare([]byte(token), []byte(secret)) != 1 {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "invalid API secret")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// auditMiddleware 对写操作（POST/DELETE）记录审计日志。
// 注意：对 SSE 流式端点（clone/pull）不包装 ResponseWriter，避免破坏 Flusher 接口。
func auditMiddleware(audit *AuditLogger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 只审计写操作
		if r.Method != http.MethodPost && r.Method != http.MethodDelete {
			next.ServeHTTP(w, r)
			return
		}

		// 跳过内部事件和健康检查
		if strings.HasPrefix(r.URL.Path, "/api/internal/") || r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// SSE 流式端点：不包装 writer（保留 Flusher 接口），仅记录审计
		if strings.HasSuffix(r.URL.Path, "/clone") || strings.HasSuffix(r.URL.Path, "/pull") || r.URL.Path == "/api/repos/import" {
			next.ServeHTTP(w, r)
			repo := r.PathValue("name")
			action := mapAction(r.Method, r.URL.Path)
			audit.Log(action, repo, r.RemoteAddr, http.StatusOK, "")
			return
		}

		wrapped := &statusResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		// 提取仓库名
		repo := ""
		if name := r.PathValue("name"); name != "" {
			repo = name
		}

		// 映射 action 名称
		action := mapAction(r.Method, r.URL.Path)
		audit.Log(action, repo, r.RemoteAddr, wrapped.statusCode, "")
	})
}

// mapAction 将请求映射为审计动作名称。
func mapAction(method, path string) string {
	switch {
	case method == "POST" && path == "/api/repos":
		return "repo.create"
	case method == "POST" && path == "/api/repos/import":
		return "repo.import"
	case method == "DELETE" && strings.HasPrefix(path, "/api/repos/"):
		if strings.HasSuffix(path, "/hooks") {
			return "hook.uninstall"
		}
		return "repo.delete"
	case method == "POST" && strings.HasSuffix(path, "/clone"):
		return "workspace.clone"
	case method == "POST" && strings.HasSuffix(path, "/pull"):
		return "workspace.pull"
	case method == "POST" && strings.HasSuffix(path, "/hooks"):
		return "hook.install"
	case method == "POST" && path == "/api/backups":
		return "backup.trigger"
	default:
		return method + " " + path
	}
}

// loggingMiddleware 记录每个请求的 method、path、status、耗时。
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &statusResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.statusCode,
			"duration", time.Since(start).String(),
			"remote", r.RemoteAddr,
		)
	})
}

// statusResponseWriter 包装 http.ResponseWriter 以捕获状态码。
// 同时实现 http.Flusher，确保 SSE 端点正常工作。
type statusResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *statusResponseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

// Flush 实现 http.Flusher 接口，透传给底层 ResponseWriter。
func (w *statusResponseWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap 返回底层 ResponseWriter，供 http.ResponseController 使用。
func (w *statusResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}
