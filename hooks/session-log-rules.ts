import { projectName } from './statusline-rules'

/** Tokens a turn's requests spent, as `turn.complete` reports them. */
export type LogTokens = { input: number; output: number; cacheRead: number; cacheCreation: number }

export type LogEntry = {
  at: number
  sessionId: string
  turnId: string
  model: string
  effort?: string | number
  /** Why the turn ended: `answer`, `aborted`, `refusal` or `error`. */
  reason: string
  prompt: string
  commands: readonly string[]
  durationMs: number
  tokens?: LogTokens
}

/** 32-bit FNV-1a as 8 hex digits: stable across runs, so one path always names one folder. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Folder name for a project: its readable name plus a hash of the whole path, so equal names in two places never share a log. */
export function projectKey(cwd: string): string {
  const name = (projectName(cwd) ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${name === '' ? 'unknown' : name}-${shortHash(cwd)}`
}

/** A log file grows to this many bytes (10 MiB), then the next turn opens a new one. */
export const LOG_MAX_BYTES = 10 * 1024 * 1024

/** Log files kept per project; past it the oldest is deleted. */
export const LOG_MAX_FILES = 2

export type LogFile = { name: string; size: number }

/** Where the next line goes, whether that file is new, and the oldest files to delete so the project keeps LOG_MAX_FILES. */
export type LogWritePlan = { name: string; isNew: boolean; remove: string[] }

/** The day the file was opened, plus a part number when a second file opened the same day. */
const LOG_NAME = /^(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/

export function logDir(home: string, key: string): string {
  return `${home}/.claude/log/${key}`
}

/** Bytes the text takes in UTF-8, which is what a file's size counts. */
function utf8Length(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/**
 * Picks the file for the next line: the newest log while the line still fits under LOG_MAX_BYTES,
 * else a new file named by the day. Only names this log writes are counted or deleted.
 */
export function planLogWrite(files: readonly LogFile[], date: string, line: string): LogWritePlan {
  const logs = files
    .flatMap(file => {
      const match = LOG_NAME.exec(file.name)
      return match ? [{ ...file, date: match[1] ?? '', part: Number(match[2] ?? 1) }] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.part - b.part)
  const current = logs.at(-1)
  const fits = current !== undefined && (current.size === 0 || current.size + utf8Length(line) <= LOG_MAX_BYTES)
  const name = fits ? current.name : nextLogName(logs, current !== undefined && current.date > date ? current.date : date)
  const kept = fits ? logs.map(log => log.name) : [...logs.map(log => log.name), name]
  return { name, isNew: !fits, remove: kept.slice(0, Math.max(0, kept.length - LOG_MAX_FILES)) }
}

/** `<day>.jsonl`, or `<day>.<n>.jsonl` when that day already has a file. */
function nextLogName(logs: readonly { date: string; part: number }[], date: string): string {
  const parts = logs.filter(log => log.date === date).map(log => log.part)
  return parts.length === 0 ? `${date}.jsonl` : `${date}.${Math.max(...parts) + 1}.jsonl`
}

/** The calendar day (YYYY-MM-DD) of a moment in the given zone; an unknown or invalid zone falls back to the host's. */
export function localDate(at: number, timezone: string | undefined): string {
  const format = (timeZone: string | undefined) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(at)
  try {
    return format(timezone)
  } catch {
    return format(undefined)
  }
}

/** One JSONL line for a finished turn; JSON escaping keeps a multi-line prompt on a single line. An unknown effort or token count is left out. */
export function buildLogLine(entry: LogEntry): string {
  const { at, sessionId, turnId, model, effort, reason, durationMs, prompt, commands, tokens } = entry
  return `${JSON.stringify({ time: new Date(at).toISOString(), sessionId, turnId, model, effort, reason, durationMs, prompt, commands, tokens })}\n`
}
