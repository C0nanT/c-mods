import { expect, mock, test } from 'claude-code/testing'

const START = 1_000_000
const RESET = '2026-10-07T18:30:00Z'

type World = { lines: (string | undefined)[]; clock: any; usage: any; calls: string[][]; reads: string[] }

function world(on: any, opts: { env?: Record<string, string>; stored?: Record<string, unknown>; rateLimits?: any[]; branch?: string; procVersion?: string; localtime?: string; powershell?: string; startedAt?: number; settings?: string | (() => string); model?: () => string } = {}): World {
  // The plain line under the prompt unless a test asks for the coloured band.
  mock.store(on, { 'statusline-color': false, ...opts.stored })
  mock.env(on, opts.env ?? {})
  const clock = mock.clock(on, { now: START + 23 * 60000 })
  const usage = {
    startedAt: opts.startedAt ?? START,
    context: { window: 200000, tokens: 28000, percent: 14 },
    rateLimits: opts.rateLimits ?? [{ kind: 'five_hour', percentUsed: 42, resetsAt: RESET }],
  }
  const lines: (string | undefined)[] = []
  const calls: string[][] = []
  const reads: string[] = []
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: usage }))
  on('session.model', () => ({ value: opts.model?.() ?? 'opus' }))
  on('ui.status', (_$: any, e: any) => (lines.push(e.text), { value: undefined }))
  on('fs.read', (_$: any, e: any) => {
    reads.push(e.path)
    if (e.path === '/proc/version' && opts.procVersion) return { value: opts.procVersion }
    if (e.path === '/home/u/.claude/settings.json' && opts.settings !== undefined) return { value: typeof opts.settings === 'function' ? opts.settings() : opts.settings }
    return { deny: 'ENOENT' }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    calls.push(argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const fail = { value: { exitCode: 1, stdout: '', stderr: '' } }
    if (argv[0] === 'git') return opts.branch === undefined ? fail : ok(`${opts.branch}\n`)
    if (argv[0] === 'timedatectl') return ok('')
    if (argv[0] === 'readlink') return opts.localtime === undefined ? fail : ok(opts.localtime)
    if (argv[0] === 'powershell.exe') return opts.powershell === undefined ? fail : ok(opts.powershell)
    return fail
  })
  return { lines, clock, usage, calls, reads }
}

const MEASURE = { context: { window: 200000, tokens: 28000, percent: 14 }, rateLimits: [], changed: ['context'] }
const START_EVENT = { cwd: '/work', surface: 'terminal', isInteractive: true }

test('measure draws model, ctx, duration, limit in the local zone and branch', async ($, on) => {
  const w = world(on, { env: { STATUSLINE_TZ: 'America/Sao_Paulo' }, branch: 'main' })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toBe('Opus · ctx:14% 28k · 23m · limit:42% ↺ 15:30 ·  main')
})

test('session start draws too', async ($, on) => {
  const w = world(on, { env: { STATUSLINE_TZ: 'UTC' } })
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('limit:42% ↺ 18:30')
})

test('over an hour reads 1h05m', async ($, on) => {
  const w = world(on)
  await w.clock.advance(42 * 60000)
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('1h05m')
})

test('no rate limit and no repo: those fields are omitted', async ($, on) => {
  const w = world(on, { rateLimits: [] })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toBe('Opus · ctx:14% 28k · 23m')
})

test('a new session start after /clear restarts the duration', async ($, on) => {
  const w = world(on, { rateLimits: [] })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('23m')
  w.usage.startedAt = START + 23 * 60000
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('0m')
  expect(w.lines.at(-1)).not.toContain('23m')
})

test('effort shows once a turn step reported it', async ($, on) => {
  const w = world(on, { rateLimits: [] })
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [] }
  })
  for await (const _chunk of $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'high', messageCount: 1 })) void _chunk
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('Opus - high')
})

const SAVED = JSON.stringify({ effortLevel: 'medium', modelSettings: { opus: { effortLevel: 'high' } } })
const settingsWorld = (on: any, settings?: string) => world(on, { env: { HOME: '/home/u' }, rateLimits: [], settings })

test('session start shows the saved per-model effort over the top-level one', async ($, on) => {
  const w = settingsWorld(on, SAVED)
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus - high')
})

test('without a per-model entry the top-level effort is used', async ($, on) => {
  const w = settingsWorld(on, JSON.stringify({ effortLevel: 'medium', modelSettings: { sonnet: { effortLevel: 'low' } } }))
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus - medium')
})

test('a turn that reports effort beats the saved one', async ($, on) => {
  const w = settingsWorld(on, SAVED)
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [] }
  })
  await $.session.start(START_EVENT)
  for await (const _chunk of $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'max', messageCount: 1 })) void _chunk
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('Opus - max')
})

test('missing settings show the model without effort', async ($, on) => {
  const w = settingsWorld(on)
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus ·')
  expect(w.lines.at(-1)).not.toContain('[')
})

test('unparseable settings show the model without effort', async ($, on) => {
  const w = settingsWorld(on, '{not json')
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus ·')
  expect(w.lines.at(-1)).not.toContain('[')
})

test('non-object settings show the model without effort', async ($, on) => {
  const w = settingsWorld(on, 'null')
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus ·')
  expect(w.lines.at(-1)).not.toContain('[')
})

test('an effort changed in settings replaces the one the last turn reported', async ($, on) => {
  let saved = JSON.stringify({ effortLevel: 'medium' })
  const w = world(on, { env: { HOME: '/home/u' }, rateLimits: [], settings: () => saved })
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [] }
  })
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus - medium')
  for await (const _chunk of $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'medium', messageCount: 1 })) void _chunk
  saved = JSON.stringify({ effortLevel: 'high' })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('Opus - high')
})

test('STATUSLINE_TZ beats the host zone', async ($, on) => {
  const w = world(on, { env: { STATUSLINE_TZ: 'Asia/Tokyo' }, localtime: '/usr/share/zoneinfo/America/Sao_Paulo' })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('↺ 03:30')
})

test('host zone comes from the /etc/localtime link', async ($, on) => {
  const w = world(on, { localtime: '/usr/share/zoneinfo/America/Sao_Paulo' })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('↺ 15:30')
})

test('WSL with Linux in UTC takes the zone from PowerShell', async ($, on) => {
  const w = world(on, { env: { WSL_DISTRO_NAME: 'Ubuntu' }, localtime: '/usr/share/zoneinfo/UTC', powershell: 'E. South America Standard Time|-180' })
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('↺ 15:30')
  expect(w.calls.some(c => c[0] === 'powershell.exe')).toBe(true)
})

test('the zone is resolved once per session', async ($, on) => {
  const w = world(on, { localtime: '/usr/share/zoneinfo/America/Sao_Paulo' })
  await $.session.measure(MEASURE)
  await $.session.measure(MEASURE)
  expect(w.calls.filter(c => c[0] === 'readlink')).toHaveLength(1)
})

test('off clears the line at once and stops drawing; on draws again', async ($, on) => {
  const w = world(on, { rateLimits: [] })
  await $.session.measure(MEASURE)
  await $.command.run({ command: 'c-mods', args: 'statusline off' })
  expect(w.lines.at(-1)).toBeUndefined()
  const count = w.lines.length
  await $.session.measure(MEASURE)
  expect(w.lines).toHaveLength(count)
  await $.command.run({ command: 'c-mods', args: 'statusline on' })
  expect(w.lines.at(-1)).toBe('Opus · ctx:14% 28k · 23m')
})

const DEFAULT = 'engine default'

async function band($: any) {
  return $.ui.mount({ plugin: 'c-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
}

test('statusline-color on draws the line in colour above the prompt and clears the plain line', async ($, on) => {
  const w = world(on, { stored: { 'statusline-color': true }, env: { STATUSLINE_TZ: 'UTC' }, branch: 'main' })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toBeUndefined()
  const ui = await band($)
  expect((await ui.find({ type: 'Text', text: 'Opus' }))?.props.color).toBe('claude')
  expect((await ui.find({ type: 'Text', text: 'ctx:14% 28k' }))?.props.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: 'limit:42% ↺ 18:30' }))?.props.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: ' main' }))?.props.color).toBe('merged')
  expect(await ui.find({ type: 'Text', text: DEFAULT })).toBeUndefined()
  await ui.unmount()
})

for (const [percent, color] of [[49, 'success'], [50, 'warning'], [79, 'warning'], [80, 'error']] as const) {
  test(`ctx at ${percent}% is drawn ${color}`, async ($, on) => {
    const w = world(on, { stored: { 'statusline-color': true }, rateLimits: [] })
    w.usage.context = { window: 200000, tokens: 28000, percent }
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
    await $.session.measure(MEASURE)
    const ui = await band($)
    expect((await ui.find({ type: 'Text', text: 'ctx:' + percent + '% 28k' }))?.props.color).toBe(color)
    await ui.unmount()
  })

  test(`a rate limit at ${percent}% is drawn ${color}`, async ($, on) => {
    world(on, { stored: { 'statusline-color': true }, rateLimits: [{ kind: 'five_hour', percentUsed: percent }] })
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
    await $.session.measure(MEASURE)
    const ui = await band($)
    expect((await ui.find({ type: 'Text', text: `limit:${percent}%` }))?.props.color).toBe(color)
    await ui.unmount()
  })
}

test('the coloured line sits above the off band when something is off', async ($, on) => {
  world(on, { stored: { 'statusline-color': true, sound: false }, rateLimits: [] })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  await $.session.measure(MEASURE)
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: 'Opus' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⚠ off: sound' })).toBeDefined()
  await ui.unmount()
})

test('statusline-color off moves the line back under the prompt; on moves it up again', async ($, on) => {
  const w = world(on, { stored: { 'statusline-color': true }, rateLimits: [] })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  await $.session.measure(MEASURE)
  await $.command.run({ command: 'c-mods', args: 'statusline-color off' })
  expect(w.lines.at(-1)).toBe('Opus · ctx:14% 28k · 23m')
  let ui = await band($)
  expect(await ui.find({ type: 'Text', text: 'Opus' })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ command: 'c-mods', args: 'statusline-color on' })
  expect(w.lines.at(-1)).toBeUndefined()
  ui = await band($)
  expect(await ui.find({ type: 'Text', text: 'Opus' })).toBeDefined()
  await ui.unmount()
})

test('statusline off clears the coloured line too', async ($, on) => {
  world(on, { stored: { 'statusline-color': true }, rateLimits: [] })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  await $.session.measure(MEASURE)
  await $.command.run({ command: 'c-mods', args: 'statusline off' })
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: 'Opus' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '⚠ off: statusline' })).toBeDefined()
  await ui.unmount()
})

test('a model switch redraws the line before any turn reports it', async ($, on) => {
  let model = 'opus'
  const w = world(on, { rateLimits: [], model: () => model })
  on('command.run', (_$: any, e: any) => ({ text: '' }))
  await $.session.start(START_EVENT)
  expect(w.lines.at(-1)).toContain('Opus ·')
  model = 'claude-sonnet-5-5'
  await $.command.run({ command: 'model', args: 'sonnet' })
  expect(w.lines.at(-1)).toContain('Sonnet 5.5 ·')
})

test('a new turn redraws with the current model', async ($, on) => {
  let model = 'opus'
  const w = world(on, { rateLimits: [], model: () => model })
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  await $.session.start(START_EVENT)
  model = 'claude-haiku-5-5'
  await $.turn.start({ text: 'hi', turnId: 't' })
  expect(w.lines.at(-1)).toContain('Haiku 5.5 ·')
})

test('a model switch drops the effort the old model reported', async ($, on) => {
  let model = 'opus'
  const w = world(on, { env: { HOME: '/home/u' }, rateLimits: [], model: () => model, settings: JSON.stringify({ modelSettings: { opus: { effortLevel: 'high' }, sonnet: { effortLevel: 'low' } } }) })
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [] }
  })
  for await (const _chunk of $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'max', messageCount: 1 })) void _chunk
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('Opus - max')
  model = 'sonnet'
  await $.session.measure(MEASURE)
  expect(w.lines.at(-1)).toContain('Sonnet - low')
})
