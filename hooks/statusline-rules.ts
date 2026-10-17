export type StatusLineFields = {
  model?: string
  effort?: string | number
  contextPercent?: number
  contextTokens?: number
  /** Milliseconds since the session began. */
  durationMs?: number
  fiveHourPercent?: number
  /** ISO 8601 time the five-hour window resets. */
  fiveHourResetsAt?: string
  /** IANA zone the reset time is drawn in; the process's own zone when absent. */
  timezone?: string
  branch?: string
  /** The session's directory; only its last segment is shown. */
  cwd?: string
}

/** `23m` under an hour, `1h05m` from there on. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

/** Thousands, rounded: 28400 becomes `28k`. */
export function formatTokens(tokens: number): string {
  return `${Math.round(tokens / 1000)}k`
}

function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** `HH:MM` of an ISO timestamp in the zone; undefined when the timestamp is not a date. */
export function formatResetTime(iso: string, timezone: string | undefined): string | undefined {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  const timeZone = timezone !== undefined && isValidTimezone(timezone) ? timezone : undefined
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date)
}

/** What a segment shows, which picks its colour in the band. */
export type StatusTone = 'model' | 'model-haiku' | 'model-opus' | 'model-fable' | 'duration' | 'usage-low' | 'usage-mid' | 'usage-warn' | 'usage-high' | 'branch' | 'project'
export type StatusSegment = { text: string; tone: StatusTone }

/** Theme colours per tone; the model is green for Haiku, orange for Sonnet (and unknown), red for Opus and Fable; usage goes green, yellow, orange, then red as it climbs (thresholds in `USAGE_STEPS`). */
export const TONE_COLORS: Record<StatusTone, string> = {
  model: 'claude',
  'model-haiku': 'success',
  'model-opus': 'error',
  'model-fable': 'error',
  duration: 'subtle',
  'usage-low': 'success',
  'usage-mid': 'warning',
  'usage-warn': 'claude',
  'usage-high': 'error',
  branch: 'merged',
  project: 'suggestion',
}

/** The Nerd Font git-branch glyph, drawn before the branch; needs a Nerd Font in the terminal. */
export const BRANCH_ICON = '\ue0a0'

/** The warning sign drawn after the Fable model name. */
export const DANGER_ICON = '\u26a0'


/**
 * The effort the user's settings.json names for the model: `modelSettings[model].effortLevel`,
 * else the top-level `effortLevel`. Non-string values are ignored; undefined when none applies.
 */
export function settingsEffort(settings: unknown, model: string | undefined): string | undefined {
  if (typeof settings !== 'object' || settings === null) return undefined
  const record = settings as Record<string, unknown>
  const perModel = model === undefined ? undefined : (record.modelSettings as Record<string, unknown> | null | undefined)?.[model]
  const own = typeof perModel === 'object' && perModel !== null ? (perModel as Record<string, unknown>).effortLevel : undefined
  if (typeof own === 'string') return own
  return typeof record.effortLevel === 'string' ? record.effortLevel : undefined
}

/** `claude-sonnet-5-5` -> `Sonnet 5.5`; an alias like `opus` -> `Opus`. A trailing `[1m]`-style suffix and an 8-digit date are dropped. */
export function prettyModel(model: string): string {
  const parts = model.replace(/\[.*\]$/, '').replace(/^claude-/, '').split('-').filter((part) => part !== '' && !/^\d{8}$/.test(part))
  const words = parts.filter((part) => !/^\d+$/.test(part)).map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  const version = parts.filter((part) => /^\d+$/.test(part)).join('.')
  const name = [...words, ...(version === '' ? [] : [version])].join(' ')
  return name === '' ? model : name
}

/** The pretty model with its effort on the right, as `Sonnet 5.5 - medium`. */
export function formatModel(model: string, effort: string | number | undefined): string {
  const name = prettyModel(model)
  return effort === undefined ? name : `${name} - ${effort}`
}

/** The model's tone by family: Haiku green, Opus and Fable red, anything else (Sonnet included) the default orange. */
export function modelTone(model: string): StatusTone {
  const id = model.toLowerCase()
  if (id.includes('haiku')) return 'model-haiku'
  if (id.includes('opus')) return 'model-opus'
  if (id.includes('fable')) return 'model-fable'
  return 'model'
}

/** The folder name of a path, ignoring trailing slashes and Windows separators; undefined for an empty or root path. */
export function projectName(cwd: string): string | undefined {
  const name = cwd.split(/[\\/]+/).filter(part => part !== '').at(-1)
  return name === undefined || name === '' ? undefined : name
}

/** Where usage turns yellow, orange and red; the context window runs out of room sooner than the rate limit does. */
export const USAGE_STEPS = {
  ctx: [50, 70, 85],
  limit: [60, 80, 90],
} as const

/** The tone for a usage percentage of the context window or of the rate limit. */
export function usageTone(percent: number, kind: keyof typeof USAGE_STEPS): StatusTone {
  const [yellow, orange, red] = USAGE_STEPS[kind]
  if (percent < yellow) return 'usage-low'
  if (percent < orange) return 'usage-mid'
  return percent < red ? 'usage-warn' : 'usage-high'
}

/** The segments, fields left to right; a field with no data is left out. */
export function buildStatusSegments(fields: StatusLineFields): StatusSegment[] {
  const segments: StatusSegment[] = []
  if (fields.model) {
    const tone = modelTone(fields.model)
    const text = formatModel(fields.model, fields.effort)
    segments.push({ text: tone === 'model-fable' ? `${text} ${DANGER_ICON}` : text, tone })
  }
  if (fields.contextPercent !== undefined) {
    const tokens = fields.contextTokens === undefined ? '' : ` ${formatTokens(fields.contextTokens)}`
    const percent = Math.round(fields.contextPercent)
    segments.push({ text: `ctx:${percent}%${tokens}`, tone: usageTone(percent, 'ctx') })
  }
  if (fields.durationMs !== undefined) segments.push({ text: formatDuration(fields.durationMs), tone: 'duration' })
  if (fields.fiveHourPercent !== undefined) {
    const reset = fields.fiveHourResetsAt === undefined ? undefined : formatResetTime(fields.fiveHourResetsAt, fields.timezone)
    const percent = Math.round(fields.fiveHourPercent)
    segments.push({ text: `limit:${percent}%${reset === undefined ? '' : ` ↺ ${reset}`}`, tone: usageTone(percent, 'limit') })
  }
  if (fields.branch) segments.push({ text: `${BRANCH_ICON} ${fields.branch}`, tone: 'branch' })
  const project = fields.cwd === undefined ? undefined : projectName(fields.cwd)
  if (project !== undefined) segments.push({ text: `project: ${project}`, tone: 'project' })
  return segments
}

export const SEGMENT_SEPARATOR = ' · '

/** The plain line: the segments' text joined. */
export function buildStatusLine(fields: StatusLineFields): string {
  return buildStatusSegments(fields)
    .map(segment => segment.text)
    .join(SEGMENT_SEPARATOR)
}

const UNHELPFUL_ZONES = new Set(['', 'UTC', 'Etc/UTC', 'Etc/UCT', 'UCT', 'Etc/Universal', 'Universal', 'Etc/Zulu', 'Zulu'])

/** An IANA zone from a `/usr/share/zoneinfo/...` link target or a plain name; undefined when it is empty, plain UTC or unknown. */
export function normalizeZone(raw: string | undefined): string | undefined {
  const zone = (raw ?? '').trim().replace(/^.*\/zoneinfo\//, '')
  return UNHELPFUL_ZONES.has(zone) || !isValidTimezone(zone) ? undefined : zone
}

/** The first host source that names a real zone; plain UTC counts as no answer. */
export function pickHostTimezone(candidates: readonly (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const zone = normalizeZone(candidate)
    if (zone !== undefined) return zone
  }
  return undefined
}

/**
 * The zone from PowerShell's `Id|BaseUtcOffsetMinutes` line: the Id when it is an IANA name,
 * else the whole-hour offset as an `Etc/GMT` zone (Windows ids such as `E. South America Standard Time` are not IANA).
 */
export function parseWindowsTimezone(output: string): string | undefined {
  const [id = '', minutes = ''] = output.trim().split('|')
  const named = normalizeZone(id)
  if (named !== undefined) return named
  const hours = Number(minutes) / 60
  if (minutes.trim() === '' || !Number.isInteger(hours) || hours === 0 || Math.abs(hours) > 12) return undefined
  return `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`
}

/** `STATUSLINE_TZ` wins; then the host's zone; the Windows zone only when neither answers. */
export function chooseTimezone(override: string | undefined, host: string | undefined, windows: string | undefined): string | undefined {
  const forced = (override ?? '').trim()
  return forced !== '' ? forced : (host ?? windows)
}
