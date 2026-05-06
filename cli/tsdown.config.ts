import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  clean: true,
  // Inject shebang so the output file is directly executable
  banner: { js: '#!/usr/bin/env node' },
  outExtensions: () => ({ js: '.mjs' }),
})
