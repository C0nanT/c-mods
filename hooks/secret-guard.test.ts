import { expect, mock, test } from 'claude-code/testing'

const HOME = '/home/test'
const FILE_BLOCKED = [
  ['Read', `${HOME}/.ssh/id_ed25519`, '~/.ssh'],
  ['Edit', `${HOME}/.aws/credentials`, '~/.aws/credentials'],
  ['Write', '/project/server.pem', '*.pem'],
  ['MultiEdit', '/project/.npmrc', '.npmrc'],
  ['Read', '/project/certs/app.key', '*.key'],
  ['Read', `${HOME}/.docker/config.json`, '~/.docker/config.json'],
  ['Read', `${HOME}/.config/gh/hosts.yml`, '~/.config/gh/hosts.yml'],
  ['Read', '/anywhere/id_rsa', 'id_rsa'],
]
const FILE_ALLOWED = [
  `${HOME}/.ssh/known_hosts`,
  `${HOME}/.ssh/config`,
  `${HOME}/.ssh/id_ed25519.pub`,
  '/project/README.md',
]
/**
 * One row per Bash command: [command, expected].
 * expected is a fragment of the deny message when the guard denies, or PASS when it lets the command run.
 * A regression is one more row.
 */
const PASS = null
type Row = [command: string, expected: string | typeof PASS]
const BASH_ROWS: Row[] = [
  // Denied.
  ['cat ~/.ssh/id_rsa', 'matches secret rule'],
  ['cat $HOME/.aws/credentials', 'matches secret rule'],
  ['cat ${HOME}/.ssh/id_ed25519', 'matches secret rule'],
  [`cat ${HOME}/.npmrc`, 'matches secret rule'],
  ['cp server.pem /tmp/x', 'matches secret rule'],
  ['cat certs/app.key', 'matches secret rule'],
  ['echo hi && cat "$HOME/.ssh/id_rsa"', 'matches secret rule'],
  // Allowed.
  ['cat ~/.ssh/known_hosts', PASS],
  ['ls ~/.ssh', PASS],
  ['cat ~/.ssh/id_ed25519.pub', PASS],
  ['echo hello', PASS],
  // Extension rules block in Bash only when the file exists: code like `row.key` passes.
  ["node -e 'rows.map(row => row.key)'", PASS],
  ['cat missing.pem', PASS],
]
const CWD = '/project'
const EXISTING = [`${CWD}/server.pem`, `${CWD}/certs/app.key`]

async function setup($: any, on: any, store = {}) {
  mock.store(on, store)
  mock.env(on, { HOME })
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', (_$: any, e: any) => ({ value: EXISTING.includes(e.path) }))
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['x'] }))
}

for (const [tool, file_path, rule] of FILE_BLOCKED) {
  test(`blocks: ${tool} ${file_path}`, async ($, on) => {
    await setup($, on)
    expect((await $.tool.call({ tool, file_path })).deny).toBe(
      `BLOCKED: '${file_path}' matches secret rule '${rule}'. The user has prevented you from reading credentials.`,
    )
  })
}

for (const file_path of FILE_ALLOWED) {
  test(`allows: Read ${file_path}`, async ($, on) => {
    await setup($, on)
    expect((await $.tool.call({ tool: 'Read', file_path })).text).toBe('ran')
  })
}

for (const [command, expected] of BASH_ROWS) {
  test(`${expected === PASS ? 'passes' : 'denies'} bash: ${JSON.stringify(command)}`, async ($, on) => {
    await setup($, on)
    const out = await $.tool.call({ tool: 'Bash', command })
    if (expected === PASS) expect(out.text).toBe('ran')
    else expect(out.deny).toContain(expected)
  })
}

test('when the file check fails, an extension match in Bash still blocks', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME })
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', () => ({ deny: 'EACCES' }))
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  expect((await $.tool.call({ tool: 'Bash', command: 'cat unknown.key' })).deny).toContain('matches secret rule')
})

test('an error inside the hook denies the call', async ($, on) => {
  mock.env(on, { HOME })
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  // No store is mocked, so reading the toggles fails inside the hook.
  const out = await $.tool.call({ tool: 'Read', file_path: '/project/a.txt' })
  expect(out.deny).toContain('failed')
})

test('/conan-mods secret-guard off lets it pass, on blocks again, band shows it', async ($, on) => {
  await setup($, on)
  const run = (args: string) => $.command.run({ command: 'conan-mods', args })
  expect((await run('secret-guard off')).text).toBe('secret-guard: off')
  expect((await $.tool.call({ tool: 'Read', file_path: `${HOME}/.ssh/id_rsa` })).text).toBe('ran')
  expect((await $.tool.call({ tool: 'Bash', command: 'cat ~/.ssh/id_rsa' })).text).toBe('ran')
  const ui = await $.ui.mount({ plugin: 'conan-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  expect(await ui.find({ type: 'Text', text: '⚠ off: secret-guard' })).toBeDefined()
  await ui.unmount()
  expect((await run('secret-guard on')).text).toBe('secret-guard: on')
  expect((await $.tool.call({ tool: 'Read', file_path: `${HOME}/.ssh/id_rsa` })).deny).toContain('BLOCKED')
  expect((await run('')).text).toContain('secret-guard: on')
})

const MISSING_HOME = /HOME could not be read/
const NO_HOME: [string, (on: any) => void][] = [
  ['empty', on => mock.env(on, { HOME: '' })],
  ['unreadable', on => on('env.get', () => ({ deny: 'EACCES' }))],
]

for (const [label, stubHome] of NO_HOME) {
  const setupNoHome = (on: any) => {
    mock.store(on)
    stubHome(on)
    on('session.cwd', () => ({ value: CWD }))
    on('fs.exists', (_$: any, e: any) => ({ value: EXISTING.includes(e.path) }))
    on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  }

  test(`HOME ${label}: home-anchored file paths are denied naming HOME`, async ($, on) => {
    setupNoHome(on)
    for (const file_path of ['~/.ssh/known_hosts', '~/.ssh/id_ed25519', '$HOME/.aws/credentials', '/home/test/.config/gcloud/creds.db', '/home/test/.docker/config.json']) {
      expect((await $.tool.call({ tool: 'Read', file_path })).deny).toMatch(MISSING_HOME)
    }
  })

  test(`HOME ${label}: home-anchored bash tokens are denied naming HOME`, async ($, on) => {
    setupNoHome(on)
    for (const command of ['cat $HOME/.aws/credentials', 'cat ${HOME}/.azure/x', 'cat /home/test/.ssh/config']) {
      expect((await $.tool.call({ tool: 'Bash', command })).deny).toMatch(MISSING_HOME)
    }
  })

  test(`HOME ${label}: ordinary calls still pass`, async ($, on) => {
    setupNoHome(on)
    expect((await $.tool.call({ tool: 'Read', file_path: '/project/README.md' })).text).toBe('ran')
    expect((await $.tool.call({ tool: 'Bash', command: 'echo hello' })).text).toBe('ran')
  })

  test(`HOME ${label}: HOME-independent rules deny with their usual rule`, async ($, on) => {
    setupNoHome(on)
    expect((await $.tool.call({ tool: 'Read', file_path: '/anywhere/id_rsa' })).deny).toContain("secret rule 'id_rsa'")
    expect((await $.tool.call({ tool: 'Read', file_path: '/project/.npmrc' })).deny).toContain("secret rule '.npmrc'")
    expect((await $.tool.call({ tool: 'Bash', command: 'cat server.pem' })).deny).toContain("secret rule '*.pem'")
  })
}
