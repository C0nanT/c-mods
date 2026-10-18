import { expect, mock, test } from 'claude-code/testing'

const NAMES = ['caveman', 'git-guard', 'dotenv-guard', 'secret-guard', 'rm-guard', 'sound', 'session-log', 'statusline', 'statusline-color']

async function hooks($: any, args = '') {
  return $.command.run({ command: 'c-mods', args })
}

test('/c-mods lists the four names, all on, on a fresh install', async ($, on) => {
  mock.store(on)
  const out = await hooks($)
  for (const name of NAMES) expect(out.text).toContain(`${name}: on`)
})

test('/c-mods git-guard off lets git push pass, on blocks again', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  expect((await hooks($, 'git-guard off')).text).toBe('git-guard: off')
  expect((await $.tool.call({ tool: 'Bash', command: 'git push origin main' })).text).toBe('ran')
  expect((await hooks($, 'git-guard on')).text).toBe('git-guard: on')
  expect((await $.tool.call({ tool: 'Bash', command: 'git push origin main' })).deny).toContain('BLOCKED')
})

for (const args of ['nope on', 'git-guard maybe', 'git-guard', 'git-guard on extra']) {
  test(`invalid input '${args}' answers usage and changes nothing`, async ($, on) => {
  mock.store(on)
    const out = await hooks($, args)
    expect(out.text).toContain('Usage: /c-mods')
    for (const name of NAMES) expect(out.text).toContain(name)
    expect((await hooks($)).text).not.toContain('off')
  })
}

test('a stored off survives into a new session', async ($, on) => {
  mock.store(on, { sound: false })
  const text = (await hooks($)).text
  expect(text).toContain('sound: off')
  expect(text).toContain('caveman: on')
})

// The test harness has no command registry, no `$.command.list` for a test and no built-in names,
// so this models the engine's rule beneath the plugin and asserts on what it registered:
// `$.command.register` refuses a built-in's name by throwing, which skips the session.start hook.
const BUILT_INS = ['hooks', 'help', 'clear']

test('session.start registers /c-mods and the hook is not skipped', async ($, on) => {
  mock.store(on)
  const registered: string[] = []
  on('command.register', (_$, e) => {
    if (BUILT_INS.includes(e.name)) throw new Error(`'${e.name}' is a built-in command`)
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  // Beneath the plugin, so it runs only if the plugin's session.start hook got as far as next(e).
  let reached = false
  on('session.start', (_$, e) => {
    reached = true
    return { cwd: e.cwd }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(reached).toBe(true)
  expect(registered).toContain('c-mods')
})
