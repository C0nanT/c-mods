import { expect, mock, test } from 'claude-code/testing'
import { bashRowTests, PASS } from './bash-rows'
import type { Row } from './bash-rows'

/**
 * One row per Bash command: [command, expected].
 * expected is the command the deny message quotes when the guard denies, or PASS when it lets the command run.
 * A regression is one more row.
 */
const BASH_ROWS: Row[] = [
  // Denied.
  ['git push origin main', 'git push origin main'],
  ['git push --force origin main', 'git push --force origin main'],
  ['git reset --hard HEAD~1', 'git reset --hard HEAD~1'],
  ['git clean -fd', 'git clean -fd'],
  ['git clean -f', 'git clean -f'],
  ['git branch -D feature', 'git branch -D feature'],
  ['git checkout .', 'git checkout .'],
  ['git restore .', 'git restore .'],
  ['git rm -rf file', 'git rm -rf file'],
  ['git checkout -f .', 'git checkout -f .'],
  ['git restore --worktree -- .', 'git restore --worktree -- .'],
  ['git restore . && git status', 'git restore . && git status'],
  ['git -C /tmp push origin main', 'git -C /tmp push origin main'],
  ['git --no-pager reset --hard HEAD~1', 'git --no-pager reset --hard HEAD~1'],
  ['git --git-dir=/repo/.git push', 'git --git-dir=/repo/.git push'],
  ['git -c user.name=y push', 'git -c user.name=y push'],
  // Denied however the flags are spelled or ordered.
  ['git clean -xdf', 'git clean -xdf'],
  ['git clean -d -f', 'git clean -d -f'],
  ['git clean --force', 'git clean --force'],
  ['git reset HEAD~1 --hard', 'git reset HEAD~1 --hard'],
  ['git reset -q --hard', 'git reset -q --hard'],
  ['git checkout HEAD -- .', 'git checkout HEAD -- .'],
  ['git restore -s HEAD .', 'git restore -s HEAD .'],
  ['git branch --delete --force x', 'git branch --delete --force x'],
  ['git branch -d -f x', 'git branch -d -f x'],
  // Denied behind any global option, and with the program or subcommand quoted.
  ['git -P push', 'git -P push'],
  ['git --bare push', 'git --bare push'],
  ['git --work-tree /x push origin main', 'git --work-tree /x push origin main'],
  ['git --git-dir /r push', 'git --git-dir /r push'],
  ['"git" push', '"git" push'],
  ['git p""ush', 'git p""ush'],
  // Denied behind wrappers and launchers, as before the parser read them.
  ['sudo -u root git push', 'sudo -u root git push'],
  ['env -i git push', 'env -i git push'],
  ['xargs git push', 'xargs git push'],
  ['timeout 5 git push', 'timeout 5 git push'],
  ['find . -exec git push \\;', 'find . -exec git push \\;'],
  ['sudo -u git -H git push', 'sudo -u git -H git push'],
  ['sudo -u git git push', 'sudo -u git git push'],
  ['find . -name git -exec git push \\;', 'find . -name git -exec git push \\;'],
  // Denied inside other shell shapes.
  ['f() { git push; }; f', 'f() { git push; }; f'],
  ['case x in x) git push;; esac', 'case x in x) git push;; esac'],
  ['cat <(git push)', 'cat <(git push)'],
  // Allowed.
  ['git commit -m x', PASS],
  ['git -c user.email=x -c user.name=y commit -m x', PASS],
  ['git -C /tmp commit -m x', PASS],
  ["grep -rn 'git commit' .", PASS],
  ['git rm --cached dist/bundle.js', PASS],
  ['git restore .env.example', PASS],
  ['git restore ./src/a.ts', PASS],
  ['git checkout .github/workflows/ci.yml', PASS],
  ['git restore --source=abc123 --worktree -- src/a.ts', PASS],
  ['git checkout -b x .', PASS], // with -b, git reads `.` as the start point and refuses to touch paths.
  ['git log --grep="reset --hard"', PASS],
  ['git commit -m "push --force"', PASS],
  ['git switch -C feature main', PASS],
  ['git worktree add -b feature ../wt main', PASS],
  ['git branch -d feature', PASS],
  ['git stash create', PASS],
  ['git reset --soft HEAD~1', PASS],
  ['git rebase main', PASS],
  ['git status', PASS],
  ['git -C /tmp status', PASS],
  ['git --no-pager log', PASS],
  ['git diff', PASS],
]

/** `git`, its global options, then the subcommand: the start of every pattern git-guard reports. */
const PREFIX = String.raw`git(\s+(-c\s+\S+|-C\s+\S+|--git-dir=\S+|--work-tree=\S+|--namespace=\S+|--no-pager|--literal-pathspecs))*\s+`
const WHOLE_TREE = String.raw`(\s+-\S+)*\s+\.(?=\s|$|[;&|])`

/** The pattern git-guard reports for a denied row, by the subcommand the row runs. */
function patternOf(command: string): string {
  if (/\bpush\b|p""ush/.test(command)) return String.raw`${PREFIX}push(?![\w-])`
  if (/\breset\b/.test(command)) return `${PREFIX}reset --hard`
  if (/\bclean\b/.test(command)) return `${PREFIX}clean -f`
  if (/\bbranch\b/.test(command)) return `${PREFIX}branch -D`
  if (/\bcheckout\b/.test(command)) return `${PREFIX}checkout${WHOLE_TREE}`
  if (/\brestore\b/.test(command)) return `${PREFIX}restore${WHOLE_TREE}`
  return String.raw`${PREFIX}rm(?![\w-])(?![^;&|\n]*--cached)`
}

bashRowTests(
  BASH_ROWS,
  (_, on) => {
    mock.store(on, { 'dotenv-guard': false, 'secret-guard': false, 'rm-guard': false })
    on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  },
  (deny, command) => {
    expect(deny).toBe(`BLOCKED: '${command}' matches dangerous pattern '${patternOf(command)}'. The user has prevented you from doing this.`)
  },
)

test('allows: a non-Bash tool whose input mentions a dangerous command', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ran', text: 'ran' }))
  const out = await $.tool.call({ tool: 'Read', file_path: 'git push --force' })
  expect(out.text).toBe('ran')
})
