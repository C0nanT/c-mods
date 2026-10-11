import { expect, mock, test } from 'claude-code/testing'

// Every guard is on (empty store) and every path exists, so an allowed command passes only because
// the guards skip its inert text.
const GIT = 'matches dangerous pattern'
const DOTENV = 'Access to .env is blocked'
const SECRET = 'matches secret rule'
const RM = "matches dangerous pattern 'rm -rf <dangerous target>'"

const ALLOWED = [
  "node -e 'rows.map(row => row.key)'",
  "cat > notes.md <<'EOF'\nKeep .env out, never cat ~/.ssh/id_rsa or id_rsa.\ngit push origin main\nrm -rf /\nEOF",
  'git commit -m "guard git push, .env and rm -rf /"',
  'git commit -F - <<EOF\nfix: stop git push, cat .env and rm -rf /\nEOF',
  'python3 - <<EOF\nprint(open("~/.ssh/id_rsa").read())\nEOF',
  "git commit -m \"$(cat <<'EOF'\nfix: don't git push, cat .env or rm -rf /\nEOF\n)\"",
]

const BLOCKED: [string, string][] = [
  ['bash <<EOF\ngit push\nEOF', GIT],
  ['sh <<EOF\ncat .env\nEOF', DOTENV],
  ['bash <<EOF\ncat ~/.ssh/id_rsa\nEOF', SECRET],
  ['sh <<EOF\nrm -rf /\nEOF', RM],
  ["bash -c 'git push'", GIT],
  ["sh -c 'cat .env'", DOTENV],
  ['bash -c "cat ~/.ssh/id_rsa"', SECRET],
  ["sh -c 'rm -rf /'", RM],
  ["eval 'git push'", GIT],
  ['eval "cat .env"', DOTENV],
  ["eval 'cat ~/.ssh/id_rsa'", SECRET],
  ["eval 'rm -rf /'", RM],
  ["echo 'git push' | bash", GIT],
  ["echo 'cat .env' | sh", DOTENV],
  ["echo 'cat ~/.ssh/id_rsa' | bash", SECRET],
  ["echo 'rm -rf /' | bash", RM],
  ['git commit -m "x" && git push', GIT],
  ['git commit -m "x"; cat .env', DOTENV],
  ['git commit -m "x" && cat ~/.ssh/id_rsa', SECRET],
  ['git commit -m "x" && rm -rf /', RM],
  ['git commit -m "$(git push)"', GIT],
  ["cat > f <<'EOF' && git push\nbody\nEOF", GIT],
  ["cat > f <<'EOF'\nbody\nEOF\ncat .env", DOTENV],
  ["cat > f <<'EOF'; cat ~/.ssh/id_rsa\nbody\nEOF", SECRET],
  ["cat > f <<'EOF' && rm -rf /\nbody\nEOF", RM],
  ["cat > f <<'EOF'\nbody\nEOF\nrm -rf /", RM],
  // Unterminated heredocs and unbalanced quotes are analysed whole.
  ['cat > f <<EOF\ngit push', GIT],
  ["node -e 'x.key; cat .env", DOTENV],
  ['python3 - <<EOF\nopen("~/.ssh/id_rsa")', SECRET],
  ['cat > f <<EOF && rm -rf /\nbody', RM],
]

function setup(on: any) {
  mock.store(on)
  mock.env(on, { HOME: '/home/test' })
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.exists', () => ({ value: true }))
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
}

for (const command of ALLOWED) {
  test(`allows inert text: ${JSON.stringify(command)}`, async ($, on) => {
    setup(on)
    expect((await $.tool.call({ tool: 'Bash', command })).text).toBe('ran')
  })
}

for (const [command, reason] of BLOCKED) {
  test(`still blocks: ${JSON.stringify(command)}`, async ($, on) => {
    setup(on)
    const out = await $.tool.call({ tool: 'Bash', command })
    expect(out.deny).toContain(reason)
    if (reason === GIT || reason === RM) expect(out.deny).toContain(`BLOCKED: '${command}'`)
  })
}

test('file tools are unchanged: a Write whose path is .env is still denied', async ($, on) => {
  setup(on)
  expect((await $.tool.call({ tool: 'Write', file_path: '/project/.env', content: 'x' })).deny).toContain('.env')
})
