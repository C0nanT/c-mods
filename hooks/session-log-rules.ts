import { projectName } from './statusline-rules'

export type LogEntry = {
  at: number
  prompt: string
  commands: readonly string[]
  durationMs: number
  isAborted: boolean
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

export function logPath(home: string, key: string, date: string): string {
  return `${home}/.claude/log/${key}/${date}.jsonl`
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

/** One JSONL line for a finished turn; JSON escaping keeps a multi-line prompt on a single line. */
export function buildLogLine(entry: LogEntry): string {
  return `${JSON.stringify({ time: new Date(entry.at).toISOString(), prompt: entry.prompt, commands: entry.commands, durationMs: entry.durationMs, isAborted: entry.isAborted })}\n`
}
