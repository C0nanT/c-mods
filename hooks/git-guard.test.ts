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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

bashRowTests(
  BASH_ROWS,
  (_, on) => {
    mock.store(on, { 'dotenv-guard': false, 'secret-guard': false, 'rm-guard': false })
    on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  },
  (deny, command) => {
    // git-guard's own pattern: a git regex or one of its two bare rows, never rm-guard's names.
    expect(deny).toMatch(new RegExp(`^BLOCKED: '${escapeRegExp(command)}' matches dangerous pattern '(git\\(|push --force'|reset --hard')`))
    expect(deny).toMatch(/'\. The user has prevented you from doing this\.$/)
  },
)

test('allows: a non-Bash tool whose input mentions a dangerous command', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ran', text: 'ran' }))
  const out = await $.tool.call({ tool: 'Read', file_path: 'git push --force' })
  expect(out.text).toBe('ran')
})
