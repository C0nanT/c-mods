import { basename, simpleCommands } from './bash-text-rules'
import type { ShellCommand } from './bash-text-rules'

export const DOTENV_FILE_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit'] as const

const SAFE_NAMES = ['.env.example', '.env.sample', '.env.dist', '.env.template']
/** `.env` followed directly by a wildcard, which the shell may expand to the file. */
const ENV_GLOB = /^\.env[*?[]/

/** True when a base name is `.env` or `.env.*`, except the safe variants. */
function isBlockedEnvName(base: string): boolean {
  if (SAFE_NAMES.includes(base)) return false
  return base === '.env' || base.startsWith('.env.')
}

/** True when the file's base name is `.env` or `.env.*`, except the safe variants. */
export function isBlockedEnvPath(path: string): boolean {
  return isBlockedEnvName(basename(path))
}

/** True when a shell word names a .env file, or `.env` and a wildcard the shell may expand. */
function isEnvWord(word: string, expands: boolean): boolean {
  const base = basename(word)
  return isBlockedEnvName(base) || (expands && ENV_GLOB.test(base))
}

/** For a `--flag=value` or `VAR=value` word, the value after the first `=` and then the word itself; else the word. */
function pathsOf(word: string): string[] {
  const equals = word.indexOf('=')
  return equals === -1 ? [word] : [word.slice(equals + 1), word]
}

/** Programs that only check whether a file exists: their arguments are not checked. */
const EXISTENCE_CHECKS = ['test', '[', 'ls']

/** The first word of the commands that is a path to a .env file, or undefined when none is. */
function blockedEnvWord(commands: readonly ShellCommand[]): string | undefined {
  for (const command of commands) {
    const args = command.program !== undefined && EXISTENCE_CHECKS.includes(command.program) ? [] : command.args
    const words = [...command.prefix, ...(command.program === undefined ? [] : [command.program]), ...args, ...command.redirects]
    for (const word of words) {
      const path = pathsOf(word).find(path => isEnvWord(path, command.globs.includes(word)))
      if (path !== undefined) return path
    }
  }
  return undefined
}

/** For a command that cannot be parsed: the first token, split on whitespace and shell punctuation, that is a .env path. */
function blockedEnvToken(command: string): string | undefined {
  return command.split(/[\s;&|<>=()"'`,]+/).find(token => token !== '' && isEnvWord(token, true))
}

/** The first .env path in the executed text of a Bash command, read word by word; split on punctuation when it cannot be parsed. */
export function blockedEnvIn(text: string): string | undefined {
  const commands = simpleCommands(text)
  return commands === undefined ? blockedEnvToken(text) : blockedEnvWord(commands)
}

const blockedMessage = (name: string) => `Access to ${name} is blocked — .env files may contain secrets. Read .env.example instead.`

export function fileBlockedMessage(path: string): string {
  return blockedMessage(basename(path))
}

export function bashBlockedMessage(word: string): string {
  return blockedMessage(word)
}
