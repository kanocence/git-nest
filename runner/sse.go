package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"time"
)

// SSEEvent 表示一个 Server-Sent Event 消息。
type SSEEvent struct {
	Type    string `json:"type"`              // "progress" | "done" | "error"
	Message string `json:"message,omitempty"` // 输出行内容
	Code    int    `json:"exitCode"` // 进程退出码（仅 done/error）
}

// sseWriter 封装 SSE 写入逻辑。
type sseWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

func newSSEWriter(w http.ResponseWriter) (*sseWriter, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("response writer does not support flushing")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // 禁用 Nginx 缓冲
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	return &sseWriter{w: w, flusher: flusher}, nil
}

// send 发送一条 SSE 事件。
func (s *sseWriter) send(event SSEEvent) {
	data, _ := json.Marshal(event)
	fmt.Fprintf(s.w, "data: %s\n\n", data)
	s.flusher.Flush()
}

// sendProgress 发送进度消息。
func (s *sseWriter) sendProgress(message string) {
	s.send(SSEEvent{Type: "progress", Message: message})
}

// sendDone 发送完成消息。
func (s *sseWriter) sendDone(exitCode int) {
	s.send(SSEEvent{Type: "done", Code: exitCode})
}

// sendError 发送错误消息。
func (s *sseWriter) sendError(message string, exitCode int) {
	s.send(SSEEvent{Type: "error", Message: message, Code: exitCode})
}

// streamCommand 执行命令并将 stdout/stderr 通过 SSE 流式输出。
// 返回进程退出码。
func streamCommand(ctx context.Context, sse *sseWriter, name string, args ...string) int {
	cmd := exec.CommandContext(ctx, name, args...)

	// 合并 stdout + stderr 到同一个 pipe
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sse.sendError(fmt.Sprintf("failed to create stdout pipe: %v", err), -1)
		return -1
	}
	cmd.Stderr = cmd.Stdout // 合并 stderr 到 stdout

	if err := cmd.Start(); err != nil {
		sse.sendError(fmt.Sprintf("failed to start command: %v", err), -1)
		return -1
	}

	// 逐行读取输出并发送
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // 最大 1MB 单行
	for scanner.Scan() {
		line := scanner.Text()
		sse.sendProgress(line)
	}

	// 等待读取 pipe 中的错误（如果有）
	if err := scanner.Err(); err != nil && err != io.EOF {
		sse.sendProgress(fmt.Sprintf("[read error: %v]", err))
	}

	// 等待命令完成
	exitCode := 0
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	return exitCode
}

// streamCommandWithTimeout 带超时的流式命令执行。
func streamCommandWithTimeout(parentCtx context.Context, sse *sseWriter, timeout time.Duration, name string, args ...string) int {
	ctx, cancel := context.WithTimeout(parentCtx, timeout)
	defer cancel()

	startTime := time.Now()
	sse.sendProgress(fmt.Sprintf("$ %s %s", name, joinArgs(args)))

	exitCode := streamCommand(ctx, sse, name, args...)

	elapsed := time.Since(startTime)

	if ctx.Err() == context.DeadlineExceeded {
		sse.sendError(fmt.Sprintf("command timed out after %s", timeout), -1)
		return -1
	}

	if exitCode == 0 {
		sse.sendProgress(fmt.Sprintf("✓ completed in %s", elapsed.Round(time.Millisecond)))
	} else {
		sse.sendProgress(fmt.Sprintf("✗ failed with exit code %d in %s", exitCode, elapsed.Round(time.Millisecond)))
	}

	return exitCode
}

// joinArgs 将参数列表格式化为可读字符串（用于日志）。
func joinArgs(args []string) string {
	result := ""
	for i, a := range args {
		if i > 0 {
			result += " "
		}
		result += a
	}
	return result
}
