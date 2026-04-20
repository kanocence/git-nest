import { describe, expect, it } from 'vitest'
import { validateAcceptanceCommand } from '../../../src/services/acceptance'

describe('validateAcceptanceCommand', () => {
  it.each([
    ['npm test', 'npm', ['test']],
    ['pnpm build', 'pnpm', ['build']],
    ['yarn lint', 'yarn', ['lint']],
    ['node scripts/check.js', 'node', ['scripts/check.js']],
    ['npx vitest run', 'npx', ['vitest', 'run']],
  ])('should allow %s', (command, executable, args) => {
    expect(validateAcceptanceCommand(command)).toEqual({
      valid: true,
      executable,
      args,
    })
  })

  it.each([
    ['npm test; rm -rf .', 'shell metacharacters'],
    ['npm test | cat', 'shell metacharacters'],
    ['npm test && npm build', 'shell metacharacters'],
    ['npm test $SECRET', 'shell metacharacters'],
    ['npm test `whoami`', 'shell metacharacters'],
    ['npm test\nnpm build', 'shell metacharacters'],
    ['/usr/bin/npm test', 'Absolute paths'],
    ['\\tools\\npm test', 'Absolute paths'],
    ['C:\\tools\\npm.cmd test', 'Absolute paths'],
    ['node ../scripts/check.js', 'parent directory'],
    ['git status', 'not in the allowed list'],
    ['', 'empty'],
    ['   ', 'empty'],
  ])('should reject %s', (command, reason) => {
    const validation = validateAcceptanceCommand(command)

    expect(validation.valid).toBe(false)
    expect(validation.reason).toContain(reason)
  })
})
