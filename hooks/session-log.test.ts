import { expect, mock, test } from 'claude-code/testing'
import { projectKey } from './session-log-rules'

const HOME = '/home/test'
const NOON = Date.parse('2026-10-18T12:00:00Z')
const DONE = { answer: 'ok', durationMs: 4200, isAborted: false, turnId: 't1' }

type Opts = { cwd?: string; stored?: Record<string, unknown>; files?: Record<string, string>; failWrite?: boolean; failRead?: boolean }

function world(on: any, opts: Opts = {}) {
  mock.store(on, opts.stored ?? {})
  mock.env(on, { HOME, STATUSLINE_TZ: 'UTC' })
  const clock = mock.clock(on, { now: NOON })
  const files: Record<string, string> = { ...opts.files }
  on('session.cwd', () => ({ value: opts.cwd ?? '/work/app' }))
  on('fs.exists', (_$: any, e: any) => ({ value: e.path in files }))
  on('fs.read', (_$: any, e: any) => (opts.failRead || !(e.path in files) ? { deny: 'ENOENT' } : { value: files[e.path] }))
  on('fs.write', (_$: any, e: any) => {
    if (opts.failWrite) return { deny: 'EACCES' }
    files[e.path] = e.text
    return { value: undefined }
  })
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { files, clock }
}

function logFile(cwd: string, date = '2026-10-18') {
  return `${HOME}/.claude/log/${projectKey(cwd)}/${date}.jsonl`
}

function lines(files: Record<string, string>, path: string) {
  return (files[path] ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line))
}

async function turn($: any, prompt: string, commands: string[] = [], done: object = DONE) {
  await $.prompt.submit({ text: prompt })
  for (const command of commands) await $.tool.call({ tool: 'Bash', command })
  await $.turn.complete(done)
}

test('a finished turn writes one line with prompt, commands and duration', async ($, on) => {
  const w = world(on)
  await turn($, 'fix the bug', ['ls', 'git status'])
  expect(lines(w.files, logFile('/work/app'))).toEqual([
    { time: '2026-10-18T12:00:00.000Z', prompt: 'fix the bug', commands: ['ls', 'git status'], durationMs: 4200, isAborted: false },
  ])
})

test('a turn with no Bash commands logs an empty list', async ($, on) => {
  const w = world(on)
  await turn($, 'just talk')
  expect(lines(w.files, logFile('/work/app'))[0].commands).toEqual([])
})

test('the next turn appends to the same day file and starts clean', async ($, on) => {
  const w = world(on)
  await turn($, 'one', ['ls'])
  await turn($, 'two')
  const written = lines(w.files, logFile('/work/app'))
  expect(written.map(l => l.prompt)).toEqual(['one', 'two'])
  expect(written[1].commands).toEqual([])
})

test('a multi-line prompt stays on one line', async ($, on) => {
  const w = world(on)
  await turn($, 'a\nb')
  expect(w.files[logFile('/work/app')].trimEnd().split('\n')).toHaveLength(1)
  expect(lines(w.files, logFile('/work/app'))[0].prompt).toBe('a\nb')
})

test('two projects with the same folder name never share a log', async ($, on) => {
  const a = world(on, { cwd: '/work/one/app' })
  await turn($, 'in one')
  expect(Object.keys(a.files)).toEqual([logFile('/work/one/app')])
  expect(logFile('/work/one/app')).not.toBe(logFile('/work/two/app'))
})

test('a new day starts a new file', async ($, on) => {
  const w = world(on)
  await turn($, 'today')
  await w.clock.advance(24 * 3600 * 1000)
  await turn($, 'tomorrow')
  expect(lines(w.files, logFile('/work/app', '2026-10-18')).map(l => l.prompt)).toEqual(['today'])
  expect(lines(w.files, logFile('/work/app', '2026-10-19')).map(l => l.prompt)).toEqual(['tomorrow'])
})

test('an aborted turn is logged and marked', async ($, on) => {
  const w = world(on)
  await turn($, 'stop me', [], { ...DONE, isAborted: true })
  expect(lines(w.files, logFile('/work/app'))[0].isAborted).toBe(true)
})

test('a sub-agent turn writes nothing', async ($, on) => {
  const w = world(on)
  await $.turn.complete({ ...DONE, agentId: 'sub1' })
  expect(w.files).toEqual({})
})

test('off: nothing is written, and on again resumes', async ($, on) => {
  const w = world(on)
  expect((await $.command.run({ command: 'c-mods', args: 'session-log off' })).text).toBe('session-log: off')
  await turn($, 'private')
  expect(w.files).toEqual({})
  await $.command.run({ command: 'c-mods', args: 'session-log on' })
  await turn($, 'public')
  expect(lines(w.files, logFile('/work/app')).map(l => l.prompt)).toEqual(['public'])
})

test('an off stored on this PC survives into the session', async ($, on) => {
  const w = world(on, { stored: { 'session-log': false } })
  await turn($, 'private')
  expect(w.files).toEqual({})
})

test('a failing write does not break the turn', async ($, on) => {
  world(on, { failWrite: true })
  await $.prompt.submit({ text: 'x' })
  const out = await $.turn.complete(DONE)
  expect(out.text).toBe('ok')
})

test('an unreadable existing log is left alone, not overwritten', async ($, on) => {
  const path = logFile('/work/app')
  const w = world(on, { files: { [path]: '{"old":true}\n' }, failRead: true })
  await turn($, 'new')
  expect(w.files[path]).toBe('{"old":true}\n')
})

test('logging never changes what the guards decide', async ($, on) => {
  world(on)
  expect((await $.tool.call({ tool: 'Bash', command: 'git push origin main' })).deny).toContain('BLOCKED')
})

test('a command a guard denies is not logged as run', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: 'push' })
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await $.turn.complete(DONE)
  expect(lines(w.files, logFile('/work/app'))[0].commands).toEqual([])
})

test('a sub-agent Bash command is not logged in the main turn', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: 'delegate' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub1' })
  await $.tool.call({ tool: 'Bash', command: 'pwd' })
  await $.turn.complete(DONE)
  expect(lines(w.files, logFile('/work/app'))[0].commands).toEqual(['pwd'])
})

test('a turn that started with logging off is not logged even if switched on mid-turn', async ($, on) => {
  const w = world(on, { stored: { 'session-log': false } })
  await $.prompt.submit({ text: 'private' })
  await $.command.run({ command: 'c-mods', args: 'session-log on' })
  await $.turn.complete(DONE)
  expect(w.files).toEqual({})
})

test('a turn that never saw a prompt does not repeat the previous one', async ($, on) => {
  const w = world(on)
  await turn($, 'first', ['ls'])
  await $.turn.complete(DONE)
  const written = lines(w.files, logFile('/work/app'))
  expect(written[1].prompt).toBe('')
  expect(written[1].commands).toEqual([])
})
