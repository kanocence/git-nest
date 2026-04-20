import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.d.ts',
      ],
    },
    server: {
      deps: {
        external: ['node:sqlite', 'sqlite', 'node:child_process', 'node:fs', 'node:path', 'node:crypto', 'node:os', 'node:stream'],
      },
    },
    pool: 'forks',
  },
  resolve: {
    alias: {
      '~': '/src',
    },
  },
})
