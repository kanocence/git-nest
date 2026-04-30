/**
 * Mock fixture data for UI development.
 *
 * Enable with:  MOCK=true  (in .env or environment)
 *
 * Coverage: GET-only display/query endpoints.
 * Mutation endpoints (POST / DELETE / etc.) are NOT intercepted.
 */

// ── Repos ────────────────────────────────────────────────────────────────────

export const MOCK_REPOS = {
  repos: [
    {
      name: 'api-gateway',
      path: '/data/git/api-gateway.git',
      lastModified: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      headBranch: 'main',
    },
    {
      name: 'web-frontend',
      path: '/data/git/web-frontend.git',
      lastModified: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
      headBranch: 'main',
    },
    {
      name: 'auth-service',
      path: '/data/git/auth-service.git',
      lastModified: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      headBranch: 'develop',
    },
    {
      name: 'shared-utils',
      path: '/data/git/shared-utils.git',
      lastModified: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      headBranch: 'main',
    },
  ],
  total: 4,
}

// ── Branches ─────────────────────────────────────────────────────────────────

export const MOCK_BRANCHES: Record<string, object> = {
  'api-gateway': {
    repo: 'api-gateway',
    branches: [
      { name: 'main', commit: 'a1b2c3d', isDefault: true },
      { name: 'feat/rate-limiting', commit: 'e4f5a6b', isDefault: false },
      { name: 'fix/timeout-handling', commit: 'c7d8e9f', isDefault: false },
    ],
  },
  'web-frontend': {
    repo: 'web-frontend',
    branches: [
      { name: 'main', commit: 'f1e2d3c', isDefault: true },
      { name: 'feat/dark-mode', commit: 'b4a5f6e', isDefault: false },
      { name: 'chore/deps-upgrade', commit: '9c8b7a6', isDefault: false },
    ],
  },
  'auth-service': {
    repo: 'auth-service',
    branches: [
      { name: 'develop', commit: '2a3b4c5', isDefault: true },
      { name: 'main', commit: '6d7e8f9', isDefault: false },
      { name: 'feat/refresh-tokens', commit: '0a1b2c3', isDefault: false },
    ],
  },
  'shared-utils': {
    repo: 'shared-utils',
    branches: [
      { name: 'main', commit: '3c4d5e6', isDefault: true },
      { name: 'feat/logging', commit: '7f8a9b0', isDefault: false },
    ],
  },
}

// ── Commit logs ───────────────────────────────────────────────────────────────

function makeLog(repo: string, branch: string | undefined, entries: { hash: string, author: string, message: string, ago: number }[]) {
  return {
    repo,
    branch: branch ?? 'main',
    total: entries.length,
    commits: entries.map(e => ({
      hash: e.hash,
      shortHash: e.hash.slice(0, 7),
      author: e.author,
      date: new Date(Date.now() - e.ago * 1000).toISOString(),
      message: e.message,
    })),
  }
}

export const MOCK_LOGS: Record<string, object> = {
  'api-gateway': makeLog('api-gateway', 'main', [
    { hash: 'a1b2c3d4e5f60011', author: 'Alice Chen', message: 'chore: bump dependencies', ago: 60 * 3 },
    { hash: 'b2c3d4e5f6007722', author: 'Bob Li', message: 'fix: handle connection pool exhaustion', ago: 60 * 90 },
    { hash: 'c3d4e5f600883399', author: 'Alice Chen', message: 'feat: add gzip compression middleware', ago: 60 * 60 * 5 },
    { hash: 'd4e5f60044aabc10', author: 'Carol Wang', message: 'test: increase coverage for proxy router', ago: 60 * 60 * 12 },
    { hash: 'e5f600115523ccdd', author: 'Bob Li', message: 'docs: update README with env vars', ago: 60 * 60 * 24 },
  ]),
  'web-frontend': makeLog('web-frontend', 'main', [
    { hash: 'f1e2d3c4b5a60011', author: 'Carol Wang', message: 'feat: add sidebar navigation', ago: 60 * 22 },
    { hash: 'e2d3c4b5a6007722', author: 'Alice Chen', message: 'fix: mobile layout overflow', ago: 60 * 60 * 3 },
    { hash: 'd3c4b5a600883399', author: 'Dave Zhang', message: 'style: apply design tokens globally', ago: 60 * 60 * 9 },
    { hash: 'c4b5a60044aabc10', author: 'Carol Wang', message: 'chore: migrate to Tailwind CSS v4', ago: 60 * 60 * 24 * 2 },
  ]),
  'auth-service': makeLog('auth-service', 'develop', [
    { hash: '2a3b4c5d6e7f0011', author: 'Dave Zhang', message: 'feat: implement refresh token rotation', ago: 60 * 60 * 2 },
    { hash: '3b4c5d6e7f008833', author: 'Bob Li', message: 'fix: JWT expiry edge case', ago: 60 * 60 * 6 },
    { hash: '4c5d6e7f00994455', author: 'Alice Chen', message: 'test: add auth middleware tests', ago: 60 * 60 * 24 },
  ]),
  'shared-utils': makeLog('shared-utils', 'main', [
    { hash: '3c4d5e6f7a8b0011', author: 'Alice Chen', message: 'feat: add request retry helper', ago: 60 * 60 * 8 },
    { hash: '4d5e6f7a8b009922', author: 'Dave Zhang', message: 'fix: deep merge edge case with null', ago: 60 * 60 * 24 * 3 },
  ]),
}

// ── Workspace state ───────────────────────────────────────────────────────────

export const MOCK_WORKSPACES: Record<string, object> = {
  'api-gateway': {
    repo: 'api-gateway',
    path: '/data/workspace/api-gateway',
    exists: true,
    isGitRepo: true,
    clean: false,
    currentBranch: 'feat/rate-limiting',
    currentCommit: 'e4f5a6b',
    occupiedByAi: true,
    activeRunId: 'run-aaa-001',
    activeTaskBranch: 'feat/rate-limiting',
    lockStatus: 'running',
    lockUpdatedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  'web-frontend': {
    repo: 'web-frontend',
    path: '/data/workspace/web-frontend',
    exists: true,
    isGitRepo: true,
    clean: true,
    currentBranch: 'feat/dark-mode',
    currentCommit: 'b4a5f6e',
    occupiedByAi: true,
    activeRunId: 'run-aaa-002',
    activeTaskBranch: 'feat/dark-mode',
    lockStatus: 'waiting_approval',
    lockUpdatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  'auth-service': {
    repo: 'auth-service',
    path: '/data/workspace/auth-service',
    exists: true,
    isGitRepo: true,
    clean: true,
    currentBranch: 'main',
    currentCommit: '6d7e8f9',
    occupiedByAi: false,
    activeRunId: null,
    activeTaskBranch: null,
    lockStatus: null,
    lockUpdatedAt: null,
  },
  'shared-utils': {
    repo: 'shared-utils',
    path: '/data/workspace/shared-utils',
    exists: false,
    isGitRepo: false,
    clean: null,
    currentBranch: null,
    currentCommit: null,
    occupiedByAi: false,
    activeRunId: null,
    activeTaskBranch: null,
    lockStatus: null,
    lockUpdatedAt: null,
  },
}

// ── AI Task files ─────────────────────────────────────────────────────────────

export const MOCK_TASKS: Record<string, object> = {
  'api-gateway': {
    repo: 'api-gateway',
    ref: 'main',
    total: 3,
    tasks: [
      {
        path: '.gn/tasks/rate-limiting.yaml',
        title: 'Implement rate limiting middleware',
        baseBranch: 'main',
        maxIterations: 3,
        hasHumanApproval: false,
        requireApproval: false,
        acceptance: { commands: ['pnpm test'], timeout: 120, fail_fast: true },
        executor: null,
        roles: ['developer'],
        nodeCount: 2,
        edgeCount: 1,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
      {
        path: '.gn/tasks/openapi.yaml',
        title: 'Add OpenAPI documentation',
        baseBranch: 'main',
        maxIterations: 2,
        hasHumanApproval: true,
        requireApproval: true,
        acceptance: null,
        executor: null,
        roles: ['developer', 'reviewer'],
        nodeCount: 3,
        edgeCount: 2,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
      {
        path: '.gn/tasks/perf-tracing.yaml',
        title: 'Add distributed tracing',
        baseBranch: 'main',
        maxIterations: null,
        hasHumanApproval: false,
        requireApproval: false,
        acceptance: { commands: ['pnpm test:e2e'], timeout: 300, fail_fast: false },
        executor: { max_turns: 20, timeout: 180000 },
        roles: ['developer', 'tester'],
        nodeCount: 4,
        edgeCount: 3,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
    ],
  },
  'web-frontend': {
    repo: 'web-frontend',
    ref: 'main',
    total: 2,
    tasks: [
      {
        path: '.gn/tasks/dark-mode.yaml',
        title: 'Add dark mode toggle',
        baseBranch: 'main',
        maxIterations: 2,
        hasHumanApproval: true,
        requireApproval: true,
        acceptance: null,
        executor: null,
        roles: ['developer'],
        nodeCount: 2,
        edgeCount: 1,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
      {
        path: '.gn/tasks/a11y-audit.yaml',
        title: 'Accessibility (a11y) audit and fixes',
        baseBranch: 'main',
        maxIterations: 3,
        hasHumanApproval: false,
        requireApproval: false,
        acceptance: { commands: ['pnpm test:a11y'], timeout: 60, fail_fast: true },
        executor: null,
        roles: ['developer', 'tester'],
        nodeCount: 3,
        edgeCount: 2,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
    ],
  },
  'auth-service': {
    repo: 'auth-service',
    ref: 'develop',
    total: 1,
    tasks: [
      {
        path: '.gn/tasks/refresh-tokens.yaml',
        title: 'Migrate JWT to refresh-token flow',
        baseBranch: 'develop',
        maxIterations: 4,
        hasHumanApproval: true,
        requireApproval: true,
        acceptance: { commands: ['go test ./...'], timeout: 240, fail_fast: true },
        executor: { max_turns: 30, timeout: 300000 },
        roles: ['developer', 'tester', 'reviewer'],
        nodeCount: 5,
        edgeCount: 4,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
    ],
  },
  'shared-utils': {
    repo: 'shared-utils',
    ref: 'main',
    total: 2,
    tasks: [
      {
        path: '.gn/tasks/ts-upgrade.yaml',
        title: 'Upgrade TypeScript to 5.4',
        baseBranch: 'main',
        maxIterations: 2,
        hasHumanApproval: false,
        requireApproval: false,
        acceptance: { commands: ['pnpm typecheck', 'pnpm test'], timeout: 120, fail_fast: true },
        executor: null,
        roles: ['developer'],
        nodeCount: 2,
        edgeCount: 1,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
      {
        path: '.gn/tasks/logging-util.yaml',
        title: 'Add structured logging utility',
        baseBranch: 'main',
        maxIterations: 2,
        hasHumanApproval: false,
        requireApproval: false,
        acceptance: { commands: ['pnpm test'], timeout: 60, fail_fast: false },
        executor: null,
        roles: ['developer'],
        nodeCount: 2,
        edgeCount: 1,
        valid: true,
        parseError: null,
        validationErrors: [],
      },
    ],
  },
}

// ── AI Runs ───────────────────────────────────────────────────────────────────

const t = (ago: number) => new Date(Date.now() - ago * 1000).toISOString()

export const MOCK_RUNS = [
  {
    id: 'run-aaa-001',
    repo: 'api-gateway',
    task_path: '.gn/tasks/rate-limiting.yaml',
    task_title: 'Implement rate limiting middleware',
    source_ref: 'main',
    base_branch: 'main',
    task_branch: 'feat/rate-limiting',
    status: 'running',
    workspace_path: '/data/workspace/api-gateway',
    created_at: t(60 * 5),
    updated_at: t(60 * 1),
    last_error: null,
    max_iterations: 3,
    current_iteration: 2,
  },
  {
    id: 'run-aaa-002',
    repo: 'web-frontend',
    task_path: '.gn/tasks/dark-mode.yaml',
    task_title: 'Add dark mode toggle',
    source_ref: 'main',
    base_branch: 'main',
    task_branch: 'feat/dark-mode',
    status: 'waiting_approval',
    workspace_path: '/data/workspace/web-frontend',
    created_at: t(60 * 35),
    updated_at: t(60 * 18),
    last_error: null,
    max_iterations: 2,
    current_iteration: 1,
  },
  {
    id: 'run-aaa-003',
    repo: 'auth-service',
    task_path: '.gn/tasks/refresh-tokens.yaml',
    task_title: 'Migrate JWT to refresh-token flow',
    source_ref: 'develop',
    base_branch: 'develop',
    task_branch: 'feat/refresh-tokens',
    status: 'completed',
    workspace_path: '/data/workspace/auth-service',
    created_at: t(60 * 60 * 3),
    updated_at: t(60 * 60 * 1),
    last_error: null,
    max_iterations: 4,
    current_iteration: 3,
  },
  {
    id: 'run-aaa-004',
    repo: 'api-gateway',
    task_path: '.gn/tasks/openapi.yaml',
    task_title: 'Add OpenAPI documentation',
    source_ref: 'main',
    base_branch: 'main',
    task_branch: 'feat/openapi-docs',
    status: 'failed',
    workspace_path: '/data/workspace/api-gateway',
    created_at: t(60 * 60 * 5),
    updated_at: t(60 * 60 * 4),
    last_error: 'Command timed out: pnpm test (exceeded 120s)',
    max_iterations: 2,
    current_iteration: 1,
  },
  {
    id: 'run-aaa-005',
    repo: 'shared-utils',
    task_path: '.gn/tasks/ts-upgrade.yaml',
    task_title: 'Upgrade TypeScript to 5.4',
    source_ref: 'main',
    base_branch: 'main',
    task_branch: 'feat/ts-upgrade',
    status: 'cancelled',
    workspace_path: '/data/workspace/shared-utils',
    created_at: t(60 * 60 * 8),
    updated_at: t(60 * 60 * 7),
    last_error: null,
    max_iterations: 2,
    current_iteration: 1,
  },
  {
    id: 'run-aaa-006',
    repo: 'shared-utils',
    task_path: '.gn/tasks/logging-util.yaml',
    task_title: 'Add structured logging utility',
    source_ref: 'main',
    base_branch: 'main',
    task_branch: 'feat/logging',
    status: 'queued',
    workspace_path: '/data/workspace/shared-utils',
    created_at: t(60 * 2),
    updated_at: t(60 * 2),
    last_error: null,
    max_iterations: 2,
    current_iteration: null,
  },
]

// ── Run events (for detail view) ──────────────────────────────────────────────

export const MOCK_RUN_EVENTS: Record<string, object[]> = {
  'run-aaa-001': [
    { id: 1, run_id: 'run-aaa-001', type: 'run.started', node_id: null, role: null, message: 'Run started', payload: null, created_at: t(60 * 5) },
    { id: 2, run_id: 'run-aaa-001', type: 'node.started', node_id: 'developer', role: 'developer', message: 'Developer node started', payload: null, created_at: t(60 * 4 + 50) },
    { id: 3, run_id: 'run-aaa-001', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'I\'ll start by reading the existing middleware structure to understand the codebase.', payload: null, created_at: t(60 * 4 + 40) },
    { id: 4, run_id: 'run-aaa-001', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'read_file: src/middleware/index.ts', payload: { tool: 'read_file', args: { path: 'src/middleware/index.ts' } }, created_at: t(60 * 4 + 30) },
    { id: 5, run_id: 'run-aaa-001', type: 'tool.result', node_id: 'developer', role: 'developer', message: 'File read successfully (87 lines)', payload: null, created_at: t(60 * 4 + 25) },
    { id: 6, run_id: 'run-aaa-001', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'Now I\'ll implement the rate limiting middleware using the token bucket algorithm.', payload: null, created_at: t(60 * 3 + 50) },
    { id: 7, run_id: 'run-aaa-001', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'write_file: src/middleware/rate-limit.ts', payload: { tool: 'write_file', args: { path: 'src/middleware/rate-limit.ts' } }, created_at: t(60 * 3) },
    { id: 8, run_id: 'run-aaa-001', type: 'tool.result', node_id: 'developer', role: 'developer', message: 'File written successfully', payload: null, created_at: t(60 * 2 + 55) },
    { id: 9, run_id: 'run-aaa-001', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'Running tests to verify the implementation...', payload: null, created_at: t(60 * 2 + 30) },
    { id: 10, run_id: 'run-aaa-001', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'run_command: pnpm test', payload: { tool: 'run_command', args: { command: 'pnpm test' } }, created_at: t(60 * 1 + 10) },
    { id: 11, run_id: 'run-aaa-001', type: 'tool.result', node_id: 'developer', role: 'developer', message: '✓ 12 tests passed, 0 failed', payload: null, created_at: t(60 * 1) },
  ],
  'run-aaa-002': [
    { id: 1, run_id: 'run-aaa-002', type: 'run.started', node_id: null, role: null, message: 'Run started', payload: null, created_at: t(60 * 35) },
    { id: 2, run_id: 'run-aaa-002', type: 'node.started', node_id: 'developer', role: 'developer', message: 'Developer node started', payload: null, created_at: t(60 * 34 + 50) },
    { id: 3, run_id: 'run-aaa-002', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'I\'ll implement the dark mode toggle using CSS custom properties and localStorage persistence.', payload: null, created_at: t(60 * 34) },
    { id: 4, run_id: 'run-aaa-002', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'write_file: src/composables/useDarkMode.ts', payload: { tool: 'write_file' }, created_at: t(60 * 32) },
    { id: 5, run_id: 'run-aaa-002', type: 'tool.result', node_id: 'developer', role: 'developer', message: 'File written successfully', payload: null, created_at: t(60 * 31 + 55) },
    { id: 6, run_id: 'run-aaa-002', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'write_file: src/components/DarkToggle.vue', payload: { tool: 'write_file' }, created_at: t(60 * 30) },
    { id: 7, run_id: 'run-aaa-002', type: 'tool.result', node_id: 'developer', role: 'developer', message: 'File written successfully', payload: null, created_at: t(60 * 29 + 55) },
    { id: 8, run_id: 'run-aaa-002', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'run_command: pnpm test', payload: { tool: 'run_command' }, created_at: t(60 * 22) },
    { id: 9, run_id: 'run-aaa-002', type: 'tool.result', node_id: 'developer', role: 'developer', message: '✓ 8 tests passed, 0 failed', payload: null, created_at: t(60 * 19) },
    { id: 10, run_id: 'run-aaa-002', type: 'node.completed', node_id: 'developer', role: 'developer', message: 'Developer node completed', payload: null, created_at: t(60 * 18 + 30) },
    { id: 11, run_id: 'run-aaa-002', type: 'run.waiting_approval', node_id: null, role: null, message: 'Waiting for human approval before proceeding', payload: null, created_at: t(60 * 18) },
  ],
  'run-aaa-003': [
    { id: 1, run_id: 'run-aaa-003', type: 'run.started', node_id: null, role: null, message: 'Run started', payload: null, created_at: t(60 * 60 * 3) },
    { id: 2, run_id: 'run-aaa-003', type: 'node.started', node_id: 'developer', role: 'developer', message: 'Developer node started', payload: null, created_at: t(60 * 60 * 3 - 10) },
    { id: 3, run_id: 'run-aaa-003', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'Implementing refresh token rotation with Redis-backed token store.', payload: null, created_at: t(60 * 60 * 2 + 60 * 50) },
    { id: 4, run_id: 'run-aaa-003', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'write_file: internal/auth/refresh.go', payload: { tool: 'write_file' }, created_at: t(60 * 60 * 2 + 60 * 30) },
    { id: 5, run_id: 'run-aaa-003', type: 'tool.result', node_id: 'developer', role: 'developer', message: 'File written successfully', payload: null, created_at: t(60 * 60 * 2 + 60 * 29) },
    { id: 6, run_id: 'run-aaa-003', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'run_command: go test ./...', payload: { tool: 'run_command' }, created_at: t(60 * 60 * 1 + 60 * 20) },
    { id: 7, run_id: 'run-aaa-003', type: 'tool.result', node_id: 'developer', role: 'developer', message: 'ok  auth-service/internal/auth  (42 tests)', payload: null, created_at: t(60 * 60 * 1 + 60 * 10) },
    { id: 8, run_id: 'run-aaa-003', type: 'node.completed', node_id: 'developer', role: 'developer', message: 'Developer node completed', payload: null, created_at: t(60 * 60 * 1 + 60 * 5) },
    { id: 9, run_id: 'run-aaa-003', type: 'run.completed', node_id: null, role: null, message: 'Run completed successfully', payload: null, created_at: t(60 * 60 * 1) },
  ],
  'run-aaa-004': [
    { id: 1, run_id: 'run-aaa-004', type: 'run.started', node_id: null, role: null, message: 'Run started', payload: null, created_at: t(60 * 60 * 5) },
    { id: 2, run_id: 'run-aaa-004', type: 'node.started', node_id: 'developer', role: 'developer', message: 'Developer node started', payload: null, created_at: t(60 * 60 * 5 - 10) },
    { id: 3, run_id: 'run-aaa-004', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'I will generate OpenAPI spec from existing route definitions.', payload: null, created_at: t(60 * 60 * 4 + 60 * 55) },
    { id: 4, run_id: 'run-aaa-004', type: 'tool.call', node_id: 'developer', role: 'developer', message: 'run_command: pnpm test', payload: { tool: 'run_command' }, created_at: t(60 * 60 * 4 + 60 * 10) },
    { id: 5, run_id: 'run-aaa-004', type: 'run.failed', node_id: null, role: null, message: 'Command timed out: pnpm test (exceeded 120s)', payload: null, created_at: t(60 * 60 * 4) },
  ],
  'run-aaa-005': [
    { id: 1, run_id: 'run-aaa-005', type: 'run.started', node_id: null, role: null, message: 'Run started', payload: null, created_at: t(60 * 60 * 8) },
    { id: 2, run_id: 'run-aaa-005', type: 'node.started', node_id: 'developer', role: 'developer', message: 'Developer node started', payload: null, created_at: t(60 * 60 * 8 - 10) },
    { id: 3, run_id: 'run-aaa-005', type: 'llm.message', node_id: 'developer', role: 'developer', message: 'Starting TypeScript upgrade from 5.3 to 5.4.', payload: null, created_at: t(60 * 60 * 7 + 60 * 55) },
    { id: 4, run_id: 'run-aaa-005', type: 'run.cancelled', node_id: null, role: null, message: 'Run cancelled by user', payload: null, created_at: t(60 * 60 * 7) },
  ],
  'run-aaa-006': [],
}
