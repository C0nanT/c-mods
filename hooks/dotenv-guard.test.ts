import { expect, mock, test } from 'claude-code/testing'
import { bashRowTests, PASS } from './bash-rows'
import type { Row } from './bash-rows'

const FILE_BLOCKED = [
  ['Read', '/project/.env'],
  ['Edit', '/project/.env'],
  ['Write', '/project/.env'],
  ['MultiEdit', '/project/.env'],
  ['Read', '/project/.env.local'],
  ['Read', '/project/.env.production'],
]
const FILE_ALLOWED = [
  ['Read', '/project/.env.example'],
  ['Edit', '/project/.env.example'],
  ['Read', '/project/.env.sample'],
  ['Read', '/project/.env.dist'],
  ['Read', '/project/.env.template'],
]
/**
 * One row per Bash command: [command, expected].
 * expected is the path the deny message names when the guard denies, or PASS when it lets the command run.
 * A regression is one more row.
 */
const BASH_ROWS: Row[] = [
  // Real access to the env file: denied.
  ['cat .env', '.env'],
  ['cat ../.env', '../.env'],
  ['cat /app/.env', '/app/.env'],
  ['cat backend/.env.local', 'backend/.env.local'],
  ['cat ".env"', '.env'],
  ["cat '.env'", '.env'],
  ['source .env', '.env'],
  ['. .env', '.env'],
  ['grep ".env" src/', '.env'],
  ['node --env-file=.env app.js', '.env'],
  ['ENV_FILE=backend/.env.local ./run', 'backend/.env.local'],
  ['wc -l < .env', '.env'],
  ['cat .env | grep DATABASE_URL', '.env'],
  ['grep -E "^POSTGRES" .env', '.env'],
  ['cp .env .baseline-wt/.env', '.env'],
  ['echo "$(cat .env)"', '.env'],
  ["sh -c 'cat .env'", '.env'],
  ['bash <<EOF\ncat ../.env\nEOF', '../.env'],
  // Wildcards that may expand to the env file: denied.
  ['cat .env*', '.env*'],
  ['cat ".env"*', '.env*'],
  ['grep X backend/.env.*', 'backend/.env.*'],
  // Unparsable (unclosed quote): split on whitespace and punctuation.
  ["cat .env 'unclosed", '.env'],
  ["echo 'unclosed quote with no env file", PASS],
  // Fix: existence-check programs only exempt their own arguments.
  ['ls .env && cat .env', '.env'],
  ['ls > .env', '.env'],
  ['[ -f .env ] && source .env', '.env'],
  ['test -e .env', PASS],
  ['[ -f .env ] && echo exists', PASS],
  ['ls .env*', PASS],
  ['ls -la .env', PASS],
  // Fix: `.` as an argument (the current directory) is not a shell, so quoted words stay arguments.
  ['grep -rn "\\.env" .', PASS],
  ['grep -r "\\.env" . | head', PASS],
  ['grep "process.env.API_URL" -r .', PASS],
  ['find . -name ".env*"', PASS],
  // Fix: a quoted wildcard or pattern is a literal word, not an expansion.
  ['grep -n "\\.env" SKILL.md', PASS],
  ['grep -n "gitignore\\|\\.env" SKILL.md', PASS],
  // Safe variants.
  ['cat .env.example', PASS],
  ['cat .env.sample', PASS],
  ['cat .env.dist', PASS],
  ['cat .env.template', PASS],
  ['echo .env.example', PASS],
  ['grep KEY .env.example', PASS],
  // Mentions only: .env named in text, not read.
  ['grep -rn "import.meta.env" src', PASS],
  ['grep -rn "import.meta.env" front-end/src', PASS],
  ["printf '/.env\\n' >> .gitignore", PASS],
  ['gh repo edit --description "guards for git, .env, secrets"', PASS],
  ['echo "copy .env.example to .env"', PASS],
  ['echo "remember to copy .env.example to .env"', PASS],
  // Inert text: heredoc bodies, commit messages, inline interpreter code.
  ["cat > notes.md <<'EOF'\ncat .env\nEOF", PASS],
  ['git commit -m "stop cat .env"', PASS],
  ["python3 -c 'open(\".env\")'", PASS],
]

for (const [tool, file_path] of FILE_BLOCKED) {
  test(`blocks: ${tool} ${file_path}`, async ($, on) => {
    mock.store(on)
    on('tool.call', { tool }, () => ({ result: 'ran', text: 'ran' }))
    const out = await $.tool.call({ tool, file_path })
    expect(out.deny).toBe(
      `Access to ${file_path.split('/').pop()} is blocked — .env files may contain secrets. Read .env.example instead.`,
    )
  })
}

for (const [tool, file_path] of FILE_ALLOWED) {
  test(`allows: ${tool} ${file_path}`, async ($, on) => {
    mock.store(on)
    on('tool.call', { tool }, () => ({ result: 'ran', text: 'ran' }))
    expect((await $.tool.call({ tool, file_path })).text).toBe('ran')
  })
}

bashRowTests(
  BASH_ROWS,
  (_, on) => {
    mock.store(on)
    on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  },
  (deny, word) => expect(deny).toBe(`Access to ${word} is blocked — .env files may contain secrets. Read .env.example instead.`),
)

for (const path of ['/project/.env', '/project/.env.local']) {
  test(`blocks: Grep path ${path}`, async ($, on) => {
    mock.store(on)
    on('tool.call', { tool: 'Grep' }, () => ({ result: 'ran', text: 'ran' }))
    const out = await $.tool.call({ tool: 'Grep', pattern: 'KEY', path })
    expect(out.deny).toBe(
      `Access to ${path.split('/').pop()} is blocked — .env files may contain secrets. Read .env.example instead.`,
    )
  })
}

for (const [pattern, path] of [
  ['KEY', '/project/.env.example'],
  ['.env', '/project/src'],
  ['.env', undefined],
]) {
  test(`allows: Grep pattern ${pattern} path ${path}`, async ($, on) => {
    mock.store(on)
    on('tool.call', { tool: 'Grep' }, () => ({ result: 'ran', text: 'ran' }))
    expect((await $.tool.call({ tool: 'Grep', pattern, path })).text).toBe('ran')
  })
}

test('/conan-mods dotenv-guard off lets everything pass, on blocks again', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ran', text: 'ran' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  on('tool.call', { tool: 'Grep' }, () => ({ result: 'ran', text: 'ran' }))
  await $.command.run({ command: 'conan-mods', args: 'dotenv-guard off' })
  expect((await $.tool.call({ tool: 'Grep', pattern: 'K', path: '/p/.env' })).text).toBe('ran')
  expect((await $.tool.call({ tool: 'Read', file_path: '/p/.env' })).text).toBe('ran')
  expect((await $.tool.call({ tool: 'Bash', command: 'cat .env' })).text).toBe('ran')
  await $.command.run({ command: 'conan-mods', args: 'dotenv-guard on' })
  expect((await $.tool.call({ tool: 'Read', file_path: '/p/.env' })).deny).toContain('is blocked')
  expect((await $.tool.call({ tool: 'Bash', command: 'cat .env' })).deny).toBe(
    'Access to .env is blocked — .env files may contain secrets. Read .env.example instead.',
  )
})
