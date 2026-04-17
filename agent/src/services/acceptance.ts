const ALLOWED_COMMAND_PREFIXES = ['npm', 'pnpm', 'yarn', 'node', 'npx']
const SHELL_META_CHARS = /[;|&$`\n]/
const WHITESPACE_SPLIT_RE = /\s+/
const WINDOWS_ABSOLUTE_PATH_RE = /^[a-z]:[\\/]/i

export interface CommandValidation {
  valid: boolean
  executable: string
  args: string[]
  reason?: string
}

export function validateAcceptanceCommand(command: string): CommandValidation {
  const trimmed = command.trim()
  const parts = trimmed.split(WHITESPACE_SPLIT_RE)
  const executable = parts[0] || ''
  const args = parts.slice(1)

  if (!trimmed) {
    return { valid: false, executable, args, reason: 'Command is empty' }
  }

  if (SHELL_META_CHARS.test(trimmed)) {
    return { valid: false, executable, args, reason: 'Command contains shell metacharacters' }
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || WINDOWS_ABSOLUTE_PATH_RE.test(trimmed) || trimmed.includes('..')) {
    return { valid: false, executable, args, reason: 'Absolute paths and parent directory references are not allowed' }
  }

  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(prefix =>
    executable === prefix || executable.startsWith(`${prefix}.`),
  )

  if (!isAllowed) {
    return { valid: false, executable, args, reason: `Command '${executable}' is not in the allowed list (${ALLOWED_COMMAND_PREFIXES.join(', ')})` }
  }

  return { valid: true, executable, args }
}
