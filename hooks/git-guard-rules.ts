import { basename } from './bash-parser'
import { simpleCommands } from './bash-text-rules'
import type { ShellCommand } from './bash-text-rules'

// Global git options (-c k=v, -C dir, --git-dir=..., etc.) can appear between
// "git" and the subcommand, so patterns tolerate them instead of requiring
// "git" and the subcommand to be adjacent.
const GIT_OPT =
  '(-c\\s+\\S+|-C\\s+\\S+|--git-dir=\\S+|--work-tree=\\S+|--namespace=\\S+|--no-pager|--literal-pathspecs)'
const GIT_PREFIX = `git(\\s+${GIT_OPT})*\\s+`
// A lone `.` (discard everything), not `.env`, `./src` or `.github/x`, which skills restore on purpose.
const WHOLE_TREE = '(\\s+-\\S+)*\\s+\\.(?=\\s|$|[;&|])'
// `git rm --cached` only unstages; it leaves the working tree alone.
const RM_WORKTREE = 'rm(?![\\w-])(?![^;&|\\n]*--cached)'

const PATTERN_PUSH = `${GIT_PREFIX}push(?![\\w-])`
const PATTERN_RESET_HARD = `${GIT_PREFIX}reset --hard`
const PATTERN_CLEAN = `${GIT_PREFIX}clean -f`
const PATTERN_BRANCH_DELETE = `${GIT_PREFIX}branch -D`
const PATTERN_CHECKOUT = `${GIT_PREFIX}checkout${WHOLE_TREE}`
const PATTERN_RESTORE = `${GIT_PREFIX}restore${WHOLE_TREE}`
const PATTERN_RM = `${GIT_PREFIX}${RM_WORKTREE}`

/** Matched against the whole text, only when the parser cannot read the command. */
export const DANGEROUS_PATTERNS: readonly string[] = [
  PATTERN_PUSH,
  PATTERN_RESET_HARD,
  `${GIT_PREFIX}clean -fd`,
  PATTERN_CLEAN,
  PATTERN_BRANCH_DELETE,
  PATTERN_CHECKOUT,
  PATTERN_RESTORE,
  PATTERN_RM,
  'push --force',
  'reset --hard',
]

/** Global options that take the next word as their value when written without `=`. */
const VALUE_OPTIONS = ['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']

/** The subcommand of a `git` command and its arguments, past git's global options. */
function subcommandOf(args: readonly string[]): { name: string; args: string[] } | undefined {
  const rest = [...args]
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    if (VALUE_OPTIONS.includes(word)) rest.shift()
    else if (!word.startsWith('-')) return { name: word, args: rest }
  }
  return undefined
}

/** True when a short-flag cluster such as `-xdf` holds `letter`. */
const hasShort = (args: readonly string[], letter: string) => args.some(arg => /^-[^-]/.test(arg) && arg.includes(letter))

/** `checkout` options that create a branch: git then reads `.` as the start point and refuses to touch paths. */
const CHECKOUT_BRANCH_OPTIONS = ['--orphan']
/** `restore` options that take the next word as their value. */
const RESTORE_VALUE_OPTIONS = ['-s', '--source']

/** True when `checkout` discards the whole tree: a lone `.` pathspec, with no branch being created. */
function checkoutsWholeTree(args: readonly string[]): boolean {
  const isBranch = hasShort(args, 'b') || hasShort(args, 'B') || args.some(arg => CHECKOUT_BRANCH_OPTIONS.includes(arg))
  return !isBranch && args.includes('.')
}

/** True when `restore` discards the whole tree: a lone `.` pathspec, not the value of `--source`. */
function restoresWholeTree(args: readonly string[]): boolean {
  const rest = [...args]
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    if (RESTORE_VALUE_OPTIONS.includes(word)) rest.shift()
    else if (word === '.') return true
  }
  return false
}

/** The pattern a parsed git subcommand matches, or undefined when it is safe. */
function matchSubcommand(name: string, args: readonly string[]): string | undefined {
  const isForced = args.includes('--force') || hasShort(args, 'f')
  switch (name) {
    case 'push':
      return PATTERN_PUSH
    case 'reset':
      return args.includes('--hard') ? PATTERN_RESET_HARD : undefined
    case 'clean':
      return isForced ? PATTERN_CLEAN : undefined
    case 'branch': {
      const isDelete = args.includes('--delete') || hasShort(args, 'd')
      return hasShort(args, 'D') || (isDelete && isForced) ? PATTERN_BRANCH_DELETE : undefined
    }
    case 'checkout':
      return checkoutsWholeTree(args) ? PATTERN_CHECKOUT : undefined
    case 'restore':
      return restoresWholeTree(args) ? PATTERN_RESTORE : undefined
    case 'rm':
      return args.includes('--cached') ? undefined : PATTERN_RM
    default:
      return undefined
  }
}

/**
 * The words after each word named `git` in a parsed command, program or argument, so launchers
 * (`sudo -u root git`, `env -i git`, `xargs git`, `timeout 5 git`, `find -exec git`) are read as git too,
 * and a `git` user or file name before the real program (`sudo -u git git push`) does not hide it.
 * A quoted string is one word, so `grep 'git push'` holds no git.
 */
function gitArgLists(shell: ShellCommand): string[][] {
  const words = [...shell.prefix, ...(shell.program === undefined ? [] : [shell.program]), ...shell.args]
  return words.flatMap((word, at) => (basename(word) === 'git' ? [words.slice(at + 1)] : []))
}

/** The pattern the parsed git commands match, or undefined when none does. */
function matchParsed(commands: readonly ShellCommand[]): string | undefined {
  for (const args of commands.flatMap(gitArgLists)) {
    const subcommand = subcommandOf(args)
    const pattern = subcommand === undefined ? undefined : matchSubcommand(subcommand.name, subcommand.args)
    if (pattern !== undefined) return pattern
  }
  return undefined
}

/** The first dangerous pattern the command matches, or undefined when it is safe. The regex list reads only what the parser cannot. */
export function matchDangerous(command: string): string | undefined {
  const commands = simpleCommands(command)
  if (commands !== undefined) return matchParsed(commands)
  return DANGEROUS_PATTERNS.find(pattern => new RegExp(pattern).test(command))
}

export function blockedMessage(command: string, pattern: string): string {
  return `BLOCKED: '${command}' matches dangerous pattern '${pattern}'. The user has prevented you from doing this.`
}
