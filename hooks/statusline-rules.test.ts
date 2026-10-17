import { expect, test } from 'claude-code/testing'
import { projectName, buildStatusLine, modelTone, buildStatusSegments, chooseTimezone, formatModel, prettyModel, usageTone, formatDuration, formatResetTime, formatTokens, parseWindowsTimezone, pickHostTimezone, settingsEffort } from './statusline-rules'

test('duration: minutes under an hour, 1h05m from there', () => {
  expect(formatDuration(0)).toBe('0m')
  expect(formatDuration(23 * 60000)).toBe('23m')
  expect(formatDuration(59 * 60000 + 59000)).toBe('59m')
  expect(formatDuration(65 * 60000)).toBe('1h05m')
  expect(formatDuration(135 * 60000)).toBe('2h15m')
})

test('tokens are thousands, rounded', () => {
  expect(formatTokens(28000)).toBe('28k')
  expect(formatTokens(28400)).toBe('28k')
  expect(formatTokens(28600)).toBe('29k')
})

test('reset time is drawn in the given zone', () => {
  expect(formatResetTime('2026-10-07T18:30:00Z', 'America/Sao_Paulo')).toBe('15:30')
  expect(formatResetTime('2026-10-07T18:30:00Z', 'UTC')).toBe('18:30')
  expect(formatResetTime('2026-10-07T00:05:00Z', 'UTC')).toBe('00:05')
  expect(formatResetTime('nonsense', 'UTC')).toBeUndefined()
})

test('the full line, left to right', () => {
  const line = buildStatusLine({
    model: 'opus',
    effort: 'high',
    contextPercent: 14,
    contextTokens: 28000,
    durationMs: 23 * 60000,
    fiveHourPercent: 42,
    fiveHourResetsAt: '2026-10-07T18:30:00Z',
    timezone: 'America/Sao_Paulo',
    branch: 'main',
  })
  expect(line).toBe('Opus - high · ctx:14% 28k · 23m · limit:42% ↺ 15:30 ·  main')
})

test('a field with no data is omitted', () => {
  expect(buildStatusLine({ model: 'opus', contextPercent: 14, contextTokens: 28000, durationMs: 60000 })).toBe('Opus · ctx:14% 28k · 1m')
  expect(buildStatusLine({})).toBe('')
})

test('host zone skips empty, UTC and unknown names and reads zoneinfo links', () => {
  expect(pickHostTimezone([undefined, 'UTC', 'Etc/UTC\n', '/usr/share/zoneinfo/America/Sao_Paulo'])).toBe('America/Sao_Paulo')
  expect(pickHostTimezone(['Not/AZone', ''])).toBeUndefined()
  expect(pickHostTimezone(['UTC'])).toBeUndefined()
})

test('Windows zone: IANA id, else whole-hour offset', () => {
  expect(parseWindowsTimezone('America/Sao_Paulo|-180')).toBe('America/Sao_Paulo')
  expect(parseWindowsTimezone('E. South America Standard Time|-180')).toBe('Etc/GMT+3')
  expect(parseWindowsTimezone('X|330')).toBeUndefined()
  expect(parseWindowsTimezone('UTC|0')).toBeUndefined()
})

test('STATUSLINE_TZ beats host, host beats Windows', () => {
  expect(chooseTimezone('Asia/Tokyo', 'America/Sao_Paulo', 'Etc/GMT+3')).toBe('Asia/Tokyo')
  expect(chooseTimezone(' ', 'America/Sao_Paulo', 'Etc/GMT+3')).toBe('America/Sao_Paulo')
  expect(chooseTimezone(undefined, undefined, 'Etc/GMT+3')).toBe('Etc/GMT+3')
})

test('ctx tone: green under 50, yellow to 69, orange to 84, red from 85', () => {
  expect(usageTone(0, 'ctx')).toBe('usage-low')
  expect(usageTone(49, 'ctx')).toBe('usage-low')
  expect(usageTone(50, 'ctx')).toBe('usage-mid')
  expect(usageTone(69, 'ctx')).toBe('usage-mid')
  expect(usageTone(70, 'ctx')).toBe('usage-warn')
  expect(usageTone(84, 'ctx')).toBe('usage-warn')
  expect(usageTone(85, 'ctx')).toBe('usage-high')
})

test('limit tone: green under 60, yellow to 79, orange to 89, red from 90', () => {
  expect(usageTone(59, 'limit')).toBe('usage-low')
  expect(usageTone(60, 'limit')).toBe('usage-mid')
  expect(usageTone(79, 'limit')).toBe('usage-mid')
  expect(usageTone(80, 'limit')).toBe('usage-warn')
  expect(usageTone(89, 'limit')).toBe('usage-warn')
  expect(usageTone(90, 'limit')).toBe('usage-high')
})

test('segments carry the same text as the line, each with its tone', () => {
  const segments = buildStatusSegments({ model: 'opus', contextPercent: 14, durationMs: 60000, fiveHourPercent: 79.6, branch: 'main' })
  expect(segments).toEqual([
    { text: 'Opus', tone: 'model-opus' },
    { text: 'ctx:14%', tone: 'usage-low' },
    { text: '1m', tone: 'duration' },
    { text: 'limit:80%', tone: 'usage-warn' },
    { text: ' main', tone: 'branch' },
  ])
})

test('effort is written right of the model', () => {
  expect(formatModel('opus', undefined)).toBe('Opus')
  expect(formatModel('opus', 'low')).toBe('Opus - low')
  expect(formatModel('opus', 'medium')).toBe('Opus - medium')
  expect(formatModel('opus', 'high')).toBe('Opus - high')
  expect(formatModel('opus', 'xhigh')).toBe('Opus - xhigh')
  expect(formatModel('opus', 'max')).toBe('Opus - max')
  expect(formatModel('opus', 'turbo')).toBe('Opus - turbo')
  expect(formatModel('opus', 3)).toBe('Opus - 3')
})

test('model ids are shown as name and version', () => {
  expect(prettyModel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(prettyModel('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  expect(prettyModel('opus')).toBe('Opus')
})

test('settings effort: per-model first, then top-level, strings only', () => {
  const settings = { effortLevel: 'medium', modelSettings: { opus: { effortLevel: 'high' }, odd: { effortLevel: 5 } } }
  expect(settingsEffort(settings, 'opus')).toBe('high')
  expect(settingsEffort(settings, 'sonnet')).toBe('medium')
  expect(settingsEffort(settings, 'odd')).toBe('medium')
  expect(settingsEffort({ effortLevel: 3 }, 'opus')).toBeUndefined()
  expect(settingsEffort({ modelSettings: null }, 'opus')).toBeUndefined()
  expect(settingsEffort(null, 'opus')).toBeUndefined()
  expect(settingsEffort('x', undefined)).toBeUndefined()
})

test('model tone by family; Fable gets the danger icon', () => {
  expect(modelTone('claude-haiku-5-5')).toBe('model-haiku')
  expect(modelTone('claude-sonnet-5-5')).toBe('model')
  expect(modelTone('opus')).toBe('model-opus')
  expect(modelTone('claude-fable-5-1[1m]')).toBe('model-fable')
  expect(modelTone('mystery')).toBe('model')
  expect(buildStatusSegments({ model: 'claude-fable-5-1', effort: 'high' })).toEqual([{ text: 'Fable 5.1 - high \u26a0', tone: 'model-fable' }])
})

test('project is the last folder of the cwd', () => {
  expect(projectName('/home/u/c-mods')).toBe('c-mods')
  expect(projectName('/home/u/c-mods/')).toBe('c-mods')
  expect(projectName('C:\\work\\app')).toBe('app')
  expect(projectName('/')).toBeUndefined()
  expect(projectName('')).toBeUndefined()
  expect(buildStatusLine({ branch: 'main', cwd: '/x/y' })).toBe('\ue0a0 main · project: y')
})
