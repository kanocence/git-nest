//go:build !linux

package main

import "fmt"

// getDiskUsage 非 Linux 平台的 stub 实现。
// 实际部署在 Docker (Linux) 中运行，本地开发时返回 nil。
func getDiskUsage(path string) (*DiskUsage, error) {
	return nil, fmt.Errorf("disk usage check not supported on this platform")
}
