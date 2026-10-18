import { expect, test } from 'claude-code/testing'
import { buildLogLine, localDate, logPath, projectKey } from './session-log-rules'

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

test('log path: home, log folder, project key, day', () => {
  expect(logPath('/home/conan', 'c-mods-1a2b3c4d', '2026-10-18')).toBe('/home/conan/.claude/log/c-mods-1a2b3c4d/2026-10-18.jsonl')
})

test('local date follows the zone, not UTC', () => {
  const at = Date.parse('2026-10-18T02:30:00Z')
  expect(localDate(at, 'UTC')).toBe('2026-10-18')
  expect(localDate(at, 'America/Sao_Paulo')).toBe('2026-10-17')
  expect(localDate(at, 'Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('log line: one JSON line with time, prompt, commands, duration', () => {
  const line = buildLogLine({ at: Date.parse('2026-10-18T12:00:00Z'), prompt: 'fix it', commands: ['ls', 'git status'], durationMs: 4200, isAborted: false })
  expect(line.endsWith('\n')).toBe(true)
  expect(line.slice(0, -1)).not.toContain('\n')
  expect(JSON.parse(line)).toEqual({ time: '2026-10-18T12:00:00.000Z', prompt: 'fix it', commands: ['ls', 'git status'], durationMs: 4200, isAborted: false })
})

test('log line: a multi-line prompt stays on one line and round-trips', () => {
  const line = buildLogLine({ at: 0, prompt: 'a\nb\n"c"', commands: [], durationMs: 1, isAborted: false })
  expect(line.slice(0, -1)).not.toContain('\n')
  expect(JSON.parse(line).prompt).toBe('a\nb\n"c"')
  expect(JSON.parse(line).commands).toEqual([])
})

test('log line: an aborted turn is marked', () => {
  expect(JSON.parse(buildLogLine({ at: 0, prompt: 'x', commands: [], durationMs: 1, isAborted: true })).isAborted).toBe(true)
})
