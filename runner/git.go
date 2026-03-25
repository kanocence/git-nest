package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// repoNameRe 仓库名白名单：小写字母、数字、下划线、点、横杠，首字符必须是字母或数字。
var repoNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{0,63}$`)

// validateRepoName 校验仓库名，防止路径穿越和非法字符。
func validateRepoName(name string) error {
	if name == "" {
		return fmt.Errorf("repo name is required")
	}
	if len(name) > 64 {
		return fmt.Errorf("repo name too long (max 64 characters)")
	}
	if strings.Contains(name, "..") {
		return fmt.Errorf("repo name must not contain '..'")
	}
	if !repoNameRe.MatchString(name) {
		return fmt.Errorf("repo name must match pattern: lowercase letters, digits, '_', '.', '-' (start with letter or digit)")
	}
	return nil
}

// repoPath 返回 bare repo 的完整路径（带 .git 后缀）。
func repoPath(dataDir, name string) string {
	return filepath.Join(dataDir, name+".git")
}

// RepoInfo 仓库基本信息。
type RepoInfo struct {
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	LastModified time.Time `json:"lastModified"`
	HeadBranch   string    `json:"headBranch,omitempty"`
}

// listRepos 扫描 dataDir 下所有 *.git 目录，返回仓库列表。
func listRepos(dataDir string) ([]RepoInfo, error) {
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, fmt.Errorf("read data dir: %w", err)
	}

	repos := make([]RepoInfo, 0, len(entries))

	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".git") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}

		name := strings.TrimSuffix(e.Name(), ".git")
		fullPath := filepath.Join(dataDir, e.Name())

		repo := RepoInfo{
			Name:         name,
			Path:         fullPath,
			LastModified: info.ModTime(),
		}

		// 尝试读取 HEAD 获取默认分支名
		if head, err := os.ReadFile(filepath.Join(fullPath, "HEAD")); err == nil {
			headStr := strings.TrimSpace(string(head))
			if strings.HasPrefix(headStr, "ref: refs/heads/") {
				repo.HeadBranch = strings.TrimPrefix(headStr, "ref: refs/heads/")
			}
		}

		repos = append(repos, repo)
	}

	return repos, nil
}

// createBareRepo 创建一个新的 bare 仓库。
func createBareRepo(ctx context.Context, dataDir, name string, timeout time.Duration) error {
	fullPath := repoPath(dataDir, name)

	if _, err := os.Stat(fullPath); err == nil {
		return &AppError{Code: "REPO_ALREADY_EXISTS", Message: "repository already exists"}
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "init", "--bare", fullPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git init --bare failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return nil
}

// deleteBareRepo 删除一个 bare 仓库及其 workspace 克隆目录。
func deleteBareRepo(dataDir, workspaceDir, name string) error {
	fullPath := repoPath(dataDir, name)

	info, err := os.Stat(fullPath)
	if os.IsNotExist(err) {
		return &AppError{Code: "REPO_NOT_FOUND", Message: "repository not found"}
	}
	if err != nil {
		return fmt.Errorf("stat repo: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("path is not a directory: %s", fullPath)
	}

	// 安全检查：确认目录包含 HEAD 文件（bare repo 的标志）
	if _, err := os.Stat(filepath.Join(fullPath, "HEAD")); os.IsNotExist(err) {
		return fmt.Errorf("path does not look like a bare git repository")
	}

	// 删除 bare repo（耗时 I/O 操作）
	if err := os.RemoveAll(fullPath); err != nil {
		return fmt.Errorf("remove bare repo: %w", err)
	}

	// 删除对应的 workspace 克隆目录（忽略错误）
	wsPath := workspacePath(workspaceDir, name)
	os.RemoveAll(wsPath)

	// 锁的清理必须在所有文件系统操作完成后进行，
	// 否则在删除期间可能有其他 goroutine 重新创建锁并进入临界区。
	repoUnlock(name)

	return nil
}

// CommitInfo 提交信息。
type CommitInfo struct {
	Hash      string `json:"hash"`
	ShortHash string `json:"shortHash"`
	Author    string `json:"author"`
	Date      string `json:"date"`
	Message   string `json:"message"`
}

// getRepoLog 获取仓库的提交日志。
// 如果 branch 不为空，则只获取该分支的日志。
func getRepoLog(ctx context.Context, dataDir, name, branch string, limit int, timeout time.Duration) ([]CommitInfo, error) {
	fullPath := repoPath(dataDir, name)

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return nil, &AppError{Code: "REPO_NOT_FOUND", Message: "repository not found"}
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 使用 ASCII 控制字符作为分隔符，避免与提交内容冲突
	// \x1f = Unit Separator (字段间), \x1e = Record Separator (记录间)
	args := []string{"--git-dir", fullPath, "log"}
	if branch != "" {
		args = append(args, branch)
	}
	args = append(args, fmt.Sprintf("-%d", limit), "--pretty=format:%H\x1f%h\x1f%an\x1f%aI\x1f%s\x1e")

	cmd := exec.CommandContext(ctx, "git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		outputStr := strings.TrimSpace(string(output))
		// 空仓库（无提交）不算错误
		if strings.Contains(outputStr, "does not have any commits") ||
			strings.Contains(outputStr, "bad default revision") {
			return []CommitInfo{}, nil
		}
		return nil, fmt.Errorf("git log failed: %s: %w", outputStr, err)
	}

	return parseGitLog(string(output)), nil
}

// parseGitLog 解析 git log 的结构化输出。
func parseGitLog(output string) []CommitInfo {
	output = strings.TrimSpace(output)
	if output == "" {
		return []CommitInfo{}
	}

	records := strings.Split(output, "\x1e")
	commits := make([]CommitInfo, 0, len(records))

	for _, record := range records {
		record = strings.TrimSpace(record)
		if record == "" {
			continue
		}

		fields := strings.SplitN(record, "\x1f", 5)
		if len(fields) < 5 {
			continue
		}

		commits = append(commits, CommitInfo{
			Hash:      fields[0],
			ShortHash: fields[1],
			Author:    fields[2],
			Date:      fields[3],
			Message:   fields[4],
		})
	}

	return commits
}

// AppError 应用层错误，包含错误码。
type AppError struct {
	Code    string
	Message string
}

func (e *AppError) Error() string {
	return e.Message
}

// BranchInfo 分支信息。
type BranchInfo struct {
	Name string `json:"name"`
}

// listBranches 列出 bare repo 的所有分支。
func listBranches(ctx context.Context, barePath string, timeout time.Duration) ([]BranchInfo, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 使用 git branch -a 在 bare repo 上列出所有分支
	cmd := exec.CommandContext(ctx, "git", "--git-dir", barePath, "branch", "-a", "--format=%(refname:short)")
	output, err := cmd.CombinedOutput()
	if err != nil {
		outputStr := strings.TrimSpace(string(output))
		// 空仓库（无提交）不算错误
		if strings.Contains(outputStr, "does not have any commits") ||
			strings.Contains(outputStr, "bad default revision") {
			return []BranchInfo{}, nil
		}
		return nil, fmt.Errorf("git branch failed: %s: %w", outputStr, err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	branches := make([]BranchInfo, 0, len(lines))
	seen := make(map[string]bool)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || line == "(unknown)" {
			continue
		}
		// 去重
		if seen[line] {
			continue
		}
		seen[line] = true
		branches = append(branches, BranchInfo{Name: line})
	}

	return branches, nil
}
