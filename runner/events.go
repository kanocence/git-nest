package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// PushEvent 表示一次 git push 事件。
type PushEvent struct {
	Repo      string    `json:"repo"`
	Ref       string    `json:"ref"`
	OldRev    string    `json:"oldrev"`
	NewRev    string    `json:"newrev"`
	Timestamp time.Time `json:"timestamp"`
}

// eventBus 事件总线，支持多个 SSE 订阅者。
type eventBus struct {
	mu          sync.RWMutex
	subscribers map[chan PushEvent]struct{}
}

func newEventBus() *eventBus {
	return &eventBus{
		subscribers: make(map[chan PushEvent]struct{}),
	}
}

// subscribe 注册一个订阅者，返回事件 channel 和取消函数。
func (eb *eventBus) subscribe() (<-chan PushEvent, func()) {
	ch := make(chan PushEvent, 16)

	eb.mu.Lock()
	eb.subscribers[ch] = struct{}{}
	eb.mu.Unlock()

	cancel := func() {
		eb.mu.Lock()
		delete(eb.subscribers, ch)
		close(ch)
		eb.mu.Unlock()
	}

	return ch, cancel
}

// publish 向所有订阅者广播事件（非阻塞）。
func (eb *eventBus) publish(event PushEvent) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	for ch := range eb.subscribers {
		select {
		case ch <- event:
		default:
			// 订阅者来不及消费则丢弃（避免阻塞）
			slog.Warn("event dropped for slow subscriber", "repo", event.Repo)
		}
	}
}

// handleInternalEvent 处理 post-receive hook 发来的推送事件通知。
// 这是一个内部端点，由 hook 脚本调用。
func handleInternalEvent(bus *eventBus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB limit
		var event PushEvent
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		event.Timestamp = time.Now()

		slog.Info("push event received",
			"repo", event.Repo,
			"ref", event.Ref,
			"newrev", event.NewRev,
		)

		bus.publish(event)

		writeJSON(w, http.StatusOK, map[string]string{
			"status": "event published",
		})
	}
}

// handleEvents SSE 端点，前端订阅实时推送事件。
func handleEvents(bus *eventBus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			writeError(w, http.StatusInternalServerError, "SSE_NOT_SUPPORTED",
				"streaming not supported")
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()

		events, cancel := bus.subscribe()
		defer cancel()

		// 发送初始连接确认
		data, _ := json.Marshal(map[string]string{"type": "connected"})
		w.Write([]byte("data: "))
		w.Write(data)
		w.Write([]byte("\n\n"))
		flusher.Flush()

		// 监听事件或客户端断开
		ctx := r.Context()
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-events:
				if !ok {
					return
				}
				payload := map[string]any{
					"type":      "push",
					"repo":      event.Repo,
					"ref":       event.Ref,
					"oldrev":    event.OldRev,
					"newrev":    event.NewRev,
					"timestamp": event.Timestamp,
				}
				data, _ := json.Marshal(payload)
				w.Write([]byte("data: "))
				w.Write(data)
				w.Write([]byte("\n\n"))
				flusher.Flush()
			}
		}
	}
}
