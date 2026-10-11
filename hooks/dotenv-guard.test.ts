import { expect, mock, test } from 'claude-code/testing'

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
// [command, the word the deny message names]
const BASH_BLOCKED: [string, string][] = [
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
  ['cat .env*', '.env*'],
  ['grep X backend/.env.*', 'backend/.env.*'],
  ['echo "$(cat .env)"', '.env'],
  ["sh -c 'cat .env'", '.env'],
  ['bash <<EOF\ncat ../.env\nEOF', '../.env'],
  // Unparsable (unclosed quote): split on whitespace and punctuation.
  ["cat .env 'unclosed", '.env'],
  // Real accesses from the transcript history.
  ['cat .env | grep DATABASE_URL', '.env'],
  ['grep -E "^POSTGRES" .env', '.env'],
  ['cp .env .baseline-wt/.env', '.env'],
]
const BASH_ALLOWED = [
  'cat .env.example',
  'cat .env.sample',
  'cat .env.dist',
  'cat .env.template',
  'echo .env.example',
  'grep KEY .env.example',
  // Mentions that the transcript history shows were wrongly blocked.
  'grep -rn "import.meta.env" src',
  'grep -rn "import.meta.env" front-end/src',
  'grep "process.env.API_URL" -r .',
  'grep -n "\\.env" SKILL.md',
  'grep -n "gitignore\\|\\.env" SKILL.md',
  "printf '/.env\\n' >> .gitignore",
  'gh repo edit --description "guards for git, .env, secrets"',
  'echo "copy .env.example to .env"',
  'echo "remember to copy .env.example to .env"',
  "echo 'unclosed quote with no env file",
  // Inert text: heredoc bodies, commit messages, inline interpreter code.
  "cat > notes.md <<'EOF'\ncat .env\nEOF",
  'git commit -m "stop cat .env"',
  "python3 -c 'open(\".env\")'",
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

for (const [command, word] of BASH_BLOCKED) {
  test(`blocks bash: ${JSON.stringify(command)}`, async ($, on) => {
    mock.store(on)
    on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
    const out = await $.tool.call({ tool: 'Bash', command })
    expect(out.deny).toBe(`Access to ${word} is blocked — .env files may contain secrets. Read .env.example instead.`)
  })
}

for (const command of BASH_ALLOWED) {
  test(`allows bash: ${JSON.stringify(command)}`, async ($, on) => {
    mock.store(on)
    on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
    expect((await $.tool.call({ tool: 'Bash', command })).text).toBe('ran')
  })
}

test('allows: a tool outside the list (Grep)', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Grep' }, () => ({ result: 'ran', text: 'ran' }))
  expect((await $.tool.call({ tool: 'Grep', file_path: '/project/.env' })).text).toBe('ran')
})

test('/conan-mods dotenv-guard off lets everything pass, on blocks again', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ran', text: 'ran' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  await $.command.run({ command: 'conan-mods', args: 'dotenv-guard off' })
  expect((await $.tool.call({ tool: 'Read', file_path: '/p/.env' })).text).toBe('ran')
  expect((await $.tool.call({ tool: 'Bash', command: 'cat .env' })).text).toBe('ran')
  await $.command.run({ command: 'conan-mods', args: 'dotenv-guard on' })
  expect((await $.tool.call({ tool: 'Read', file_path: '/p/.env' })).deny).toContain('is blocked')
  expect((await $.tool.call({ tool: 'Bash', command: 'cat .env' })).deny).toBe(
    'Access to .env is blocked — .env files may contain secrets. Read .env.example instead.',
  )
})
