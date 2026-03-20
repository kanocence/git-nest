package main

import "sync"

// 基于内存的 per-repo 互斥锁。
// 单进程 sidecar 场景下无需文件锁，内存锁即可保证并发安全。
var (
	locks   = make(map[string]*sync.Mutex)
	locksMu sync.Mutex
)

// repoLock 获取指定仓库的互斥锁，返回解锁函数。
// 用法：
//
//	unlock := repoLock("my-repo")
//	defer unlock()
func repoLock(name string) func() {
	locksMu.Lock()
	mu, ok := locks[name]
	if !ok {
		mu = &sync.Mutex{}
		locks[name] = mu
	}
	locksMu.Unlock()

	mu.Lock()
	return mu.Unlock
}

// repoUnlock 删除仓库时清理锁条目，防止内存泄漏。
func repoUnlock(name string) {
	locksMu.Lock()
	delete(locks, name)
	locksMu.Unlock()
}
