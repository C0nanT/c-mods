import { expect, mock, test } from 'claude-code/testing'
import { LOG_MAX_BYTES, projectKey } from './session-log-rules'

const HOME = '/home/test'
const NOON = Date.parse('2026-10-18T12:00:00Z')
const USAGE = { model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 }
const DONE = { answer: 'ok', durationMs: 4200, isAborted: false, reason: 'answer', turnId: 't1', usage: USAGE }

type Opts = { cwd?: string; stored?: Record<string, unknown>; files?: Record<string, string>; failWrite?: boolean; failAppend?: boolean; failList?: boolean; sizes?: Record<string, number> }

function world(on: any, opts: Opts = {}) {
  mock.store(on, opts.stored ?? {})
  mock.env(on, { HOME, STATUSLINE_TZ: 'UTC' })
  const clock = mock.clock(on, { now: NOON })
  const files: Record<string, string> = { ...opts.files }
  const runs: string[][] = []
  on('session.cwd', () => ({ value: opts.cwd ?? '/work/app' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('fs.exists', (_$: any, e: any) => ({ value: e.path in files }))
  on('fs.list', (_$: any, e: any) => {
    if (opts.failList) return { deny: 'EACCES' }
    const names = Object.keys(files).filter(path => path.startsWith(`${e.path}/`)).map(path => path.slice(e.path.length + 1))
    if (names.length === 0) return { deny: 'ENOENT' }
    const size = (name: string) => opts.sizes?.[name] ?? files[`${e.path}/${name}`]!.length
    return { value: names.map(name => ({ name, kind: 'file', size: size(name), mtimeMs: 0, isLink: false })) }
  })
  on('fs.write', (_$: any, e: any) => {
    if (opts.failWrite) return { deny: 'EACCES' }
    files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = [...e.argv]
    runs.push(argv)
    const [cmd, , , path] = argv
    if (cmd === 'tee') {
      const target = argv[2]!
      if (opts.failAppend || !(target in files)) return { value: { exitCode: 1, stdout: '', stderr: 'tee: failed' } }
      files[target] += e.init.stdin
    }
    if (cmd === 'rm' && path !== undefined) delete files[path]
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { files, clock, runs }
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

async function step($: any, model: string, effort?: string, agentId?: string) {
  for await (const _chunk of $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1, agentId })) void _chunk
}

test('a finished turn writes one line with session, model, effort, tokens, prompt and commands', async ($, on) => {
  const w = world(on)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [] }
  })
  await $.prompt.submit({ text: 'fix the bug' })
  await step($, 'claude-opus-5-5', 'high')
  for (const command of ['ls', 'git status']) await $.tool.call({ tool: 'Bash', command })
  await $.turn.complete(DONE)
  expect(lines(w.files, logFile('/work/app'))).toEqual([
    {
      time: '2026-10-18T12:00:00.000Z',
      sessionId: 's1',
      turnId: 't1',
      model: 'claude-opus-5-5',
      effort: 'high',
      reason: 'answer',
      durationMs: 4200,
      prompt: 'fix the bug',
      commands: ['ls', 'git status'],
      tokens: { input: 10, output: 20, cacheRead: 300, cacheCreation: 40 },
    },
  ])
})

test('a turn with no usage takes the model from its last step and logs no tokens', async ($, on) => {
  const w = world(on)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [] }
  })
  await $.prompt.submit({ text: 'stop' })
  await step($, 'claude-haiku-5-5', 'low')
  await step($, 'claude-opus-5-5', 'max', 'sub1')
  await $.turn.complete({ ...DONE, usage: undefined, isAborted: true, reason: 'aborted' })
  const [line] = lines(w.files, logFile('/work/app'))
  expect([line.model, line.effort, line.reason, 'tokens' in line]).toEqual(['claude-haiku-5-5', 'low', 'aborted', false])
})

test('a turn with no step and no usage takes the session model and logs no effort', async ($, on) => {
  const w = world(on)
  await turn($, 'x', [], { ...DONE, usage: undefined, reason: 'error' })
  const [line] = lines(w.files, logFile('/work/app'))
  expect([line.model, 'effort' in line, line.reason]).toEqual(['claude-sonnet-5-5', false, 'error'])
})

test('the effort of one turn does not leak into the next', async ($, on) => {
  const w = world(on)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [] }
  })
  await $.prompt.submit({ text: 'one' })
  await step($, 'claude-opus-5-5', 'high')
  await $.turn.complete(DONE)
  await turn($, 'two')
  expect(lines(w.files, logFile('/work/app')).map(l => l.effort)).toEqual(['high', undefined])
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

test('a new day keeps appending to the current file', async ($, on) => {
  const w = world(on)
  await turn($, 'today')
  await w.clock.advance(24 * 3600 * 1000)
  await turn($, 'tomorrow')
  expect(lines(w.files, logFile('/work/app', '2026-10-18')).map(l => l.prompt)).toEqual(['today', 'tomorrow'])
  expect(Object.keys(w.files)).toEqual([logFile('/work/app', '2026-10-18')])
})

test('a full file opens a new one named by the day, and the old one stays', async ($, on) => {
  const old = logFile('/work/app', '2026-10-01')
  const w = world(on, { files: { [old]: '{"old":true}\n' }, sizes: { '2026-10-01.jsonl': LOG_MAX_BYTES } })
  await turn($, 'fresh')
  expect(w.files[old]).toBe('{"old":true}\n')
  expect(lines(w.files, logFile('/work/app')).map(l => l.prompt)).toEqual(['fresh'])
})

test('a third file deletes the oldest of the project', async ($, on) => {
  const oldest = logFile('/work/app', '2026-10-01')
  const full = logFile('/work/app', '2026-10-10')
  const other = `${HOME}/.claude/log/${projectKey('/work/other')}/2026-09-01.jsonl`
  const w = world(on, {
    files: { [oldest]: 'a\n', [full]: 'b\n', [other]: 'c\n' },
    sizes: { '2026-10-01.jsonl': LOG_MAX_BYTES, '2026-10-10.jsonl': LOG_MAX_BYTES },
  })
  await turn($, 'fresh')
  expect(w.runs).toContainEqual(['rm', '-f', '--', oldest])
  expect(Object.keys(w.files).sort()).toEqual([other, full, logFile('/work/app')].sort())
})

test('an aborted turn is logged with its reason', async ($, on) => {
  const w = world(on)
  await turn($, 'stop me', [], { ...DONE, isAborted: true, reason: 'aborted' })
  expect(lines(w.files, logFile('/work/app'))[0].reason).toBe('aborted')
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

test('a failed append changes no file, deletes nothing and does not break the turn', async ($, on) => {
  const path = logFile('/work/app')
  const w = world(on, { files: { [path]: '{"old":true}\n' }, failAppend: true })
  await $.prompt.submit({ text: 'x' })
  expect((await $.turn.complete(DONE)).text).toBe('ok')
  expect(w.files).toEqual({ [path]: '{"old":true}\n' })
  expect(w.runs.some(argv => argv[0] === 'rm')).toBe(false)
})

test('an existing log in a folder that cannot be listed is appended to, not overwritten', async ($, on) => {
  const path = logFile('/work/app')
  const w = world(on, { files: { [path]: '{"old":true}\n' }, failList: true })
  await turn($, 'new')
  expect(lines(w.files, path).map(l => l.prompt ?? 'old')).toEqual(['old', 'new'])
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
