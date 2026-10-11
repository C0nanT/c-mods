export const DOTENV_FILE_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit'] as const

const SAFE_NAMES = ['.env.example', '.env.sample', '.env.dist', '.env.template']
/** `.env` followed directly by a wildcard, which the shell may expand to the file. */
const ENV_GLOB = /^\.env[*?[]/

/** True when the file's base name is `.env` or `.env.*`, except the safe variants. */
export function isBlockedEnvPath(path: string): boolean {
  const base = path.split('/').filter(Boolean).pop() ?? ''
  if (SAFE_NAMES.includes(base)) return false
  return base === '.env' || base.startsWith('.env.')
}

/** True when a shell word names a .env file: its part after the last `/` is a blocked name, or `.env` and a wildcard. */
function isEnvWord(word: string): boolean {
  const base = word.split('/').pop() ?? ''
  if (SAFE_NAMES.includes(base)) return false
  return base === '.env' || base.startsWith('.env.') || ENV_GLOB.test(base)
}

/** For a `--flag=value` or `VAR=value` word, the value after the first `=` and then the word itself; else the word. */
function pathsOf(word: string): string[] {
  const equals = word.indexOf('=')
  return equals === -1 ? [word] : [word.slice(equals + 1), word]
}

/** Programs that only check whether a file exists: their arguments are not checked. */
const EXISTENCE_CHECKS = ['test', '[', 'ls']

type Command = { prefix: readonly string[]; program: string | undefined; args: readonly string[]; redirects: readonly string[] }

/** The first word of the commands that is a path to a .env file, or undefined when none is. */
export function blockedEnvWord(commands: readonly Command[]): string | undefined {
  for (const command of commands) {
    const args = command.program !== undefined && EXISTENCE_CHECKS.includes(command.program) ? [] : command.args
    const words = [...command.prefix, ...(command.program === undefined ? [] : [command.program]), ...args, ...command.redirects]
    const path = words.flatMap(pathsOf).find(isEnvWord)
    if (path !== undefined) return path
  }
  return undefined
}

/** For a command that cannot be parsed: the first token, split on whitespace and shell punctuation, that is a .env path. */
export function blockedEnvToken(command: string): string | undefined {
  return command.split(/[\s;&|<>=()"'`,]+/).find(token => token !== '' && isEnvWord(token))
}

export function fileBlockedMessage(path: string): string {
  const base = path.split('/').filter(Boolean).pop() ?? ''
  return `Access to ${base} is blocked — .env files may contain secrets. Read .env.example instead.`
}

export function bashBlockedMessage(word: string): string {
  return `Access to ${word} is blocked — .env files may contain secrets. Read .env.example instead.`
}
