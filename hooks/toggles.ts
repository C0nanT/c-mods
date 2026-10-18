export const TOGGLE_NAMES = ['caveman', 'git-guard', 'dotenv-guard', 'secret-guard', 'rm-guard', 'sound', 'session-log', 'statusline', 'statusline-color'] as const
export type ToggleName = (typeof TOGGLE_NAMES)[number]
export type Toggles = Record<ToggleName, boolean>

export type ModsCommand =
  | { kind: 'list' }
  | { kind: 'set'; name: ToggleName; isOn: boolean }
  | { kind: 'usage' }

/** Interprets the argument text of `/c-mods`. */
export function parseModsArgs(args: string): ModsCommand {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'list' }
  const [name, value, ...rest] = words
  const toggle = TOGGLE_NAMES.find(known => known === name)
  if (toggle === undefined || rest.length > 0 || (value !== 'on' && value !== 'off')) return { kind: 'usage' }
  return { kind: 'set', name: toggle, isOn: value === 'on' }
}

export function usageText(): string {
  return `Usage: /c-mods [<name> on|off]\nValid names: ${TOGGLE_NAMES.join(', ')}`
}

export function listText(toggles: Toggles): string {
  return TOGGLE_NAMES.map(name => `${name}: ${toggles[name] ? 'on' : 'off'}`).join('\n')
}

const BAND_ORDER: readonly ToggleName[] = ['git-guard', 'dotenv-guard', 'secret-guard', 'rm-guard', 'caveman', 'sound', 'session-log', 'statusline', 'statusline-color']

/** The band text for the functions that are off, in fixed order; undefined when all are on. */
export function offBandText(toggles: Toggles): string | undefined {
  const off = BAND_ORDER.filter(name => !toggles[name])
  return off.length === 0 ? undefined : `⚠ off: ${off.join(' · ')}`
}
