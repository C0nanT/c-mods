import { expect, mock, test } from 'claude-code/testing'

const DIR = '/usr/share/sounds/freedesktop/stereo'
const DONE = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'complete' }

function world(on: any, opts: { wsl?: boolean; procVersion?: string; failing?: string[]; missing?: string[]; stored?: Record<string, unknown> } = {}) {
  mock.store(on, { 'session-log': false, ...opts.stored })
  mock.env(on, opts.wsl ? { WSL_DISTRO_NAME: 'Ubuntu' } : {})
  const clock = mock.clock(on)
  const calls: string[][] = []
  const writes: string[] = []
  on('fs.read', (_$: any, e: any) => (e.path === '/proc/version' && opts.procVersion ? { value: opts.procVersion } : { deny: 'ENOENT' }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  on('fs.write', (_$: any, e: any) => (writes.push(e.path), { value: undefined }))
  on('process.run', (_$: any, e: any) => {
    calls.push([...e.argv])
    if (opts.missing?.includes(e.argv[0])) return { deny: 'not found' }
    const isFailing = opts.failing?.includes(e.argv.at(-1))
    return { value: { exitCode: isFailing ? 1 : 0, stdout: '', stderr: '' } }
  })
  return { calls, writes, clock }
}

test('WSL: runs PowerShell with the current beeps and never paplay', async ($, on) => {
  const w = world(on, { wsl: true })
  await $.turn.complete(DONE)
  expect(w.calls).toHaveLength(1)
  expect(w.calls[0].slice(0, 4)).toEqual(['powershell.exe', '-WindowStyle', 'Hidden', '-Command'])
  expect(w.calls[0][4]).toBe('[Console]::Beep(523, 120);[Console]::Beep(659, 120);[Console]::Beep(784, 180);')
})

test('WSL is also detected by microsoft in /proc/version', async ($, on) => {
  const w = world(on, { procVersion: 'Linux 5.15 microsoft-standard-WSL2' })
  await $.turn.complete(DONE)
  expect(w.calls.map(c => c[0])).toEqual(['powershell.exe'])
})

test('Ubuntu: plays complete.oga with paplay and stops there', async ($, on) => {
  const w = world(on)
  await $.turn.complete(DONE)
  expect(w.calls).toEqual([['paplay', `${DIR}/complete.oga`]])
})

test('Ubuntu: falls back to bell.oga when complete.oga fails', async ($, on) => {
  const w = world(on, { failing: [`${DIR}/complete.oga`] })
  await $.turn.complete(DONE)
  expect(w.calls).toEqual([['paplay', `${DIR}/complete.oga`], ['paplay', `${DIR}/bell.oga`]])
})

test('Ubuntu: falls back to aplay when paplay is missing, without breaking the session', async ($, on) => {
  const w = world(on, { missing: ['paplay'] })
  await $.turn.complete(DONE)
  expect(w.calls.map(c => c[0])).toEqual(['paplay', 'paplay', 'aplay'])
})

test('off: no command is called', async ($, on) => {
  const w = world(on)
  await $.command.run({ command: 'c-mods', args: 'sound off' })
  await $.turn.complete(DONE)
  expect(w.calls).toEqual([])
})

test('two completions within 2 s sound once, a later one sounds again', async ($, on) => {
  const w = world(on)
  await $.turn.complete(DONE)
  await w.clock.advance(1999)
  await $.turn.complete(DONE)
  expect(w.calls).toHaveLength(1)
  await w.clock.advance(1)
  await $.turn.complete(DONE)
  expect(w.calls).toHaveLength(2)
})

test('writes no file to disk', async ($, on) => {
  const w = world(on)
  await $.turn.complete(DONE)
  expect(w.writes).toEqual([])
})
