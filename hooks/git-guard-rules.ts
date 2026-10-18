import { basename } from './bash-parser'
import { simpleCommands } from './bash-text-rules'

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

/** Matched against the whole text: the only check when the parser cannot read the command, a second one when it can. */
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
      return args.includes('.') ? PATTERN_CHECKOUT : undefined
    case 'restore':
      return args.includes('.') ? PATTERN_RESTORE : undefined
    case 'rm':
      return args.includes('--cached') ? undefined : PATTERN_RM
    default:
      return undefined
  }
}

/** The pattern the parsed git commands match; undefined when none does or the parser cannot read the command. */
function matchParsed(command: string): string | undefined {
  for (const shell of simpleCommands(command) ?? []) {
    if (basename(shell.program ?? '') !== 'git') continue
    const subcommand = subcommandOf(shell.args)
    const pattern = subcommand === undefined ? undefined : matchSubcommand(subcommand.name, subcommand.args)
    if (pattern !== undefined) return pattern
  }
  return undefined
}

/** The first dangerous pattern the command matches, or undefined when it is safe. */
export function matchDangerous(command: string): string | undefined {
  return matchParsed(command) ?? DANGEROUS_PATTERNS.find(pattern => new RegExp(pattern).test(command))
}

export function blockedMessage(command: string, pattern: string): string {
  return `BLOCKED: '${command}' matches dangerous pattern '${pattern}'. The user has prevented you from doing this.`
}
