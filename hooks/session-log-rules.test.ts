import { expect, test } from 'claude-code/testing'
import { buildLogLine, localDate, LOG_MAX_BYTES, logDir, planLogWrite, projectKey } from './session-log-rules'

test('project key: folder name plus a hash of the whole path', () => {
  expect(projectKey('/home/conan/projects/c-mods')).toMatch(/^c-mods-[0-9a-f]{8}$/)
})

test('project key: same folder name in another place gets another key', () => {
  expect(projectKey('/home/conan/a/app')).not.toBe(projectKey('/home/conan/b/app'))
})

test('project key: same path gives the same key', () => {
  expect(projectKey('/home/conan/a/app')).toBe(projectKey('/home/conan/a/app'))
})

test('project key: unsafe characters in the folder name are replaced', () => {
  expect(projectKey('/home/conan/my app:v2')).toMatch(/^my-app-v2-[0-9a-f]{8}$/)
})

test('project key: a missing cwd still gives a usable key', () => {
  expect(projectKey('')).toMatch(/^unknown-[0-9a-f]{8}$/)
  expect(projectKey('/')).toMatch(/^unknown-[0-9a-f]{8}$/)
})

test('log dir: home, log folder, project key', () => {
  expect(logDir('/home/conan', 'c-mods-1a2b3c4d')).toBe('/home/conan/.claude/log/c-mods-1a2b3c4d')
})

const LINE = '{"prompt":"x"}\n'

test('plan: an empty folder opens a file named by the day', () => {
  expect(planLogWrite([], '2026-10-30', LINE)).toEqual({ name: '2026-10-30.jsonl', isNew: true, remove: [] })
})

test('plan: a line that fits goes to the newest file, whatever its day', () => {
  const files = [{ name: '2026-10-12.jsonl', size: 100 }]
  expect(planLogWrite(files, '2026-10-30', LINE)).toEqual({ name: '2026-10-12.jsonl', isNew: false, remove: [] })
})

test('plan: a line that fills the file exactly still fits', () => {
  const files = [{ name: '2026-10-12.jsonl', size: LOG_MAX_BYTES - LINE.length }]
  expect(planLogWrite(files, '2026-10-30', LINE).name).toBe('2026-10-12.jsonl')
})

test('plan: a full file opens a new one; under the cap nothing is deleted', () => {
  const files = [{ name: '2026-10-12.jsonl', size: LOG_MAX_BYTES }]
  expect(planLogWrite(files, '2026-10-30', LINE)).toEqual({ name: '2026-10-30.jsonl', isNew: true, remove: [] })
})

test('plan: a third file deletes the oldest', () => {
  const files = [{ name: '2026-10-30.jsonl', size: LOG_MAX_BYTES }, { name: '2026-10-01.jsonl', size: LOG_MAX_BYTES }]
  expect(planLogWrite(files, '2026-11-04', LINE)).toEqual({ name: '2026-11-04.jsonl', isNew: true, remove: ['2026-10-01.jsonl'] })
})

test('plan: a file filled the same day it opened gets a part number, ordered after it', () => {
  const files = [{ name: '2026-10-30.jsonl', size: LOG_MAX_BYTES }, { name: '2026-10-29.jsonl', size: 5 }]
  expect(planLogWrite(files, '2026-10-30', LINE)).toEqual({ name: '2026-10-30.2.jsonl', isNew: true, remove: ['2026-10-29.jsonl'] })
  const parts = [{ name: '2026-10-30.2.jsonl', size: LOG_MAX_BYTES }, { name: '2026-10-30.jsonl', size: LOG_MAX_BYTES }]
  expect(planLogWrite(parts, '2026-10-30', LINE)).toEqual({ name: '2026-10-30.3.jsonl', isNew: true, remove: ['2026-10-30.jsonl'] })
})

test('plan: the old one-file-per-day logs are cut to the newest two', () => {
  const files = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'].map(day => ({ name: `${day}.jsonl`, size: 10 }))
  expect(planLogWrite(files, '2026-10-30', LINE)).toEqual({ name: '2026-10-21.jsonl', isNew: false, remove: ['2026-10-18.jsonl', '2026-10-19.jsonl'] })
})

test('plan: files this log did not name are never counted or deleted', () => {
  const files = [{ name: 'notes.txt', size: 1 }, { name: 'old.jsonl', size: 1 }, { name: '2026-10-29.jsonl', size: LOG_MAX_BYTES }, { name: '2026-10-28.jsonl', size: 1 }]
  expect(planLogWrite(files, '2026-10-30', LINE).remove).toEqual(['2026-10-28.jsonl'])
})

test('plan: size counts UTF-8 bytes, not characters', () => {
  const accented = 'ã'.repeat(10)
  const files = [{ name: '2026-10-30.jsonl', size: LOG_MAX_BYTES - 15 }]
  expect(planLogWrite(files, '2026-10-30', accented).isNew).toBe(true)
})

test('plan: an empty newest file takes even a line over the limit', () => {
  const files = [{ name: '2026-10-30.jsonl', size: 0 }]
  expect(planLogWrite(files, '2026-10-30', LINE).name).toBe('2026-10-30.jsonl')
})

test('plan: a clock that went back never names a file older than the newest', () => {
  const files = [{ name: '2026-10-30.jsonl', size: LOG_MAX_BYTES }]
  expect(planLogWrite(files, '2026-10-29', LINE).name).toBe('2026-10-30.2.jsonl')
})

test('local date follows the zone, not UTC', () => {
  const at = Date.parse('2026-10-18T02:30:00Z')
  expect(localDate(at, 'UTC')).toBe('2026-10-18')
  expect(localDate(at, 'America/Sao_Paulo')).toBe('2026-10-17')
  expect(localDate(at, 'Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

const ENTRY = { at: 0, sessionId: 's1', turnId: 't1', model: 'claude-opus-5-5', reason: 'answer', prompt: 'x', commands: [], durationMs: 1 }

test('log line: one JSON line with every field, in a fixed order', () => {
  const tokens = { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 }
  const line = buildLogLine({ ...ENTRY, at: Date.parse('2026-10-18T12:00:00Z'), effort: 'high', prompt: 'fix it', commands: ['ls', 'git status'], durationMs: 4200, tokens })
  expect(line.endsWith('\n')).toBe(true)
  expect(line.slice(0, -1)).not.toContain('\n')
  expect(Object.keys(JSON.parse(line))).toEqual(['time', 'sessionId', 'turnId', 'model', 'effort', 'reason', 'durationMs', 'prompt', 'commands', 'tokens'])
  expect(JSON.parse(line)).toEqual({
    time: '2026-10-18T12:00:00.000Z',
    sessionId: 's1',
    turnId: 't1',
    model: 'claude-opus-5-5',
    effort: 'high',
    reason: 'answer',
    durationMs: 4200,
    prompt: 'fix it',
    commands: ['ls', 'git status'],
    tokens,
  })
})

test('log line: a multi-line prompt stays on one line and round-trips', () => {
  const line = buildLogLine({ ...ENTRY, prompt: 'a\nb\n"c"' })
  expect(line.slice(0, -1)).not.toContain('\n')
  expect(JSON.parse(line).prompt).toBe('a\nb\n"c"')
  expect(JSON.parse(line).commands).toEqual([])
})

test('log line: an unknown effort or token count is left out', () => {
  expect(Object.keys(JSON.parse(buildLogLine(ENTRY)))).toEqual(['time', 'sessionId', 'turnId', 'model', 'reason', 'durationMs', 'prompt', 'commands'])
})

test('log line: a numeric effort is kept as a number', () => {
  expect(JSON.parse(buildLogLine({ ...ENTRY, effort: 32000 })).effort).toBe(32000)
})
