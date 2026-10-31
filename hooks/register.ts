import type { EngineInterface, Register } from 'claude-code'
import { executedText } from './bash-text-rules'
import { CAVEMAN_WARNING, pluginSkillPaths, skillsShSkillPath } from './caveman-rules'
import { bashBlockedMessage, blockedEnvIn, DOTENV_FILE_TOOLS, fileBlockedMessage, isBlockedEnvPath } from './dotenv-guard-rules'
import { blockedMessage, matchDangerous } from './git-guard-rules'
import { matchRmDangerous, rmBlockedMessage } from './rm-guard-rules'
import { isExtensionRule, matchSecretCommand, matchSecretPath, resolveCommandPath, SECRET_FILE_TOOLS, secretBlockedMessage } from './secret-guard-rules'
import { buildLogLine, localDate, logDir, planLogWrite, projectKey } from './session-log-rules'
import type { LogEntry, LogFile } from './session-log-rules'
import { isWsl, SOUND_DEBOUNCE_MS, ubuntuCommands, wslCommand } from './sound-rules'
import { buildStatusSegments, chooseTimezone, parseWindowsTimezone, pickHostTimezone, SEGMENT_SEPARATOR, settingsEffort, TONE_COLORS } from './statusline-rules'
import type { StatusSegment } from './statusline-rules'
import { listText, offBandText, parseModsArgs, TOGGLE_NAMES, usageText } from './toggles'
import type { ToggleName, Toggles } from './toggles'

const EFFORT_POLL_MS = 2000
const PANE_ID = 'c-mods'
const toggles = { plugin: 'c-mods', key: 'toggles' } as const

// These helpers stay in this file: `$` is only followed into functions declared here.

/** Every toggle: session state first, then the per-PC store; absent means on. */
async function readToggles($: EngineInterface): Promise<Toggles> {
  const { value } = await $.state.get(toggles)
  const result = {} as Toggles
  for (const name of TOGGLE_NAMES) {
    const held = value?.[name]
    result[name] = typeof held === 'boolean' ? held : (await $.store.get(name)) !== false
  }
  return result
}

async function setToggle($: EngineInterface, name: ToggleName, isOn: boolean): Promise<void> {
  const current = await readToggles($)
  await $.store.set(name, isOn)
  await $.state.set(toggles, { ...current, [name]: isOn })
  $.ui.invalidate('ui.render')
}

/** Switches one function by the path the text command and the pane's buttons share. */
async function applyToggle($: EngineInterface, state: StatusLineState, name: ToggleName, isOn: boolean): Promise<void> {
  await setToggle($, name, isOn)
  if (name !== 'statusline' && name !== 'statusline-color') return
  if ((await readToggles($)).statusline) await drawStatusLine($, state)
  else clearStatusLine($, state)
}

/**
 * The fail-closed body every guard's `.catch` shares: an error before `next` was called denies the call
 * (`<plugin>: <guard> failed, <noun> blocked.`); after `next` the result passes through.
 */
function failClosed($: EngineInterface, e: unknown, next: ((e: unknown) => unknown) & { called: boolean }, guard: string, noun: 'command' | 'call') {
  return next.called ? next(e) : { deny: `${$.plugin.name}: ${guard} failed, ${noun} blocked.` }
}

/** One toggle, by the same rule as readToggles: session state first, then that one store key; absent means on. */
async function readToggle($: EngineInterface, name: ToggleName): Promise<boolean> {
  const { value } = await $.state.get(toggles)
  const held = value?.[name]
  return typeof held === 'boolean' ? held : (await $.store.get(name)) !== false
}

/**
 * One Bash guard under its own fail-closed catch: undefined when the guard is off or lets the command
 * pass, its deny when it blocks, and `<plugin>: <guard> failed, command blocked.` when it throws.
 */
async function runBashGuard($: EngineInterface, guard: ToggleName, decide: () => Promise<{ deny: string } | undefined>): Promise<{ deny: string } | undefined> {
  try {
    if (!(await readToggle($, guard))) return undefined
    return await decide()
  } catch {
    return { deny: `${$.plugin.name}: ${guard} failed, command blocked.` }
  }
}

/** The dotenv-guard denial for a file tool's or Grep's path input; undefined when it may pass. */
function envPathDenial(path: unknown): { deny: string } | undefined {
  return typeof path === 'string' && path !== '' && isBlockedEnvPath(path) ? { deny: fileBlockedMessage(path) } : undefined
}

/** A skill file's text; undefined when missing, unreadable or empty. */
async function readSkillText($: EngineInterface, path: string): Promise<string | undefined> {
  const text = await readText($, path)
  return text === undefined || text.trim() === '' ? undefined : text
}

/**
 * The skill's text from the first install that has it (skills.sh, then the c-skills plugin), or
 * undefined when none can be read (missing, unreadable or empty). The plugin's path is looked up
 * at each read, so a plugin update needs nothing here.
 */
async function readCavemanSkill($: EngineInterface): Promise<string | undefined> {
  try {
    const home = await readHome($)
    if (home === '') return undefined
    const skillsSh = await readSkillText($, skillsShSkillPath(home))
    if (skillsSh !== undefined) return skillsSh
    const registry = await readText($, `${home}/.claude/plugins/installed_plugins.json`)
    for (const path of pluginSkillPaths(await readCwd($), registry, await readUserSettings($))) {
      const text = await readSkillText($, path)
      if (text !== undefined) return text
    }
    return undefined
  } catch {
    return undefined
  }
}

/** True when the command ran and exited 0; a command that cannot start counts as failed. */
async function runs($: EngineInterface, argv: readonly string[]): Promise<boolean> {
  try {
    return (await $.process.run(argv)).exitCode === 0
  } catch {
    return false
  }
}

async function readProcVersion($: EngineInterface): Promise<string | undefined> {
  try {
    return await $.fs.read('/proc/version')
  } catch {
    return undefined
  }
}

/** HOME, or an empty string when it is unset or cannot be read. */
async function readHome($: EngineInterface): Promise<string> {
  try {
    return (await $.env.get('HOME')) ?? ''
  } catch {
    return ''
  }
}

/** Whether the path exists; a failed check counts as existing, so the guard stays closed. */
async function pathExists($: EngineInterface, path: string): Promise<boolean> {
  try {
    return await $.fs.exists(path)
  } catch {
    return true
  }
}

/** The session's directory, or an empty string when it cannot be read. */
async function readCwd($: EngineInterface): Promise<string> {
  try {
    return await $.session.cwd()
  } catch {
    return ''
  }
}

type StatusLineState = {
  effort?: string | number
  /** The model the last draw showed; a different one means the effort and settings read so far are stale. */
  drawnModel?: string
  /** What the coloured band draws; undefined while the plain line is in use or nothing was drawn. */
  segments?: StatusSegment[]
  timezone?: string
  isTimezoneResolved: boolean
  /** The effort settings.json named at the last look; a different one later means the person changed it. */
  savedEffort?: string
  isSavedEffortSeen: boolean
}

/** Trimmed stdout of a command that exited 0; undefined when it failed or cannot start. */
async function outputOf($: EngineInterface, argv: readonly string[]): Promise<string | undefined> {
  try {
    const result = await $.process.run(argv)
    return result.exitCode === 0 ? result.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

/** The user's ~/.claude/settings.json, parsed; undefined when missing, unreadable or invalid. */
async function readUserSettings($: EngineInterface): Promise<unknown> {
  try {
    const home = await readHome($)
    const text = home === '' ? undefined : await readText($, `${home}/.claude/settings.json`)
    return text === undefined ? undefined : JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Reads the saved effort for the model and tells whether it differs from the last look. A changed
 * saved effort means the person picked a new one, so the effort the last turn reported is dropped.
 */
async function syncSavedEffort($: EngineInterface, state: StatusLineState, model: string): Promise<{ saved: string | undefined; isChanged: boolean }> {
  const saved = settingsEffort(await readUserSettings($), model)
  const isChanged = state.isSavedEffortSeen && saved !== state.savedEffort
  if (isChanged) state.effort = undefined
  state.savedEffort = saved
  state.isSavedEffortSeen = true
  return { saved, isChanged }
}

/** The zone the reset time is drawn in, read once per session: STATUSLINE_TZ, the host, then Windows under WSL. */
async function resolveTimezone($: EngineInterface, state: StatusLineState): Promise<string | undefined> {
  if (state.isTimezoneResolved) return state.timezone
  const override = await $.env.get('STATUSLINE_TZ')
  let host: string | undefined
  let windows: string | undefined
  if ((override ?? '').trim() === '') {
    host = pickHostTimezone([
      await outputOf($, ['timedatectl', 'show', '-p', 'Timezone', '--value']),
      await readText($, '/etc/timezone'),
      await outputOf($, ['readlink', '/etc/localtime']),
    ])
    if (host === undefined && isWsl(await readProcVersion($), await $.env.get('WSL_DISTRO_NAME'))) {
      const output = await outputOf($, ['powershell.exe', '-NoProfile', '-Command', "[TimeZoneInfo]::Local.Id + '|' + [TimeZoneInfo]::Local.BaseUtcOffset.TotalMinutes"])
      windows = output === undefined ? undefined : parseWindowsTimezone(output)
    }
  }
  state.timezone = chooseTimezone(override, host, windows)
  state.isTimezoneResolved = true
  return state.timezone
}


/** Clears both places the status line can be drawn. */
function clearStatusLine($: EngineInterface, state: StatusLineState): void {
  $.ui.status(undefined)
  if (state.segments === undefined) return
  state.segments = undefined
  $.ui.invalidate('ui.render')
}

/**
 * Draws the status line from the session's usage: in colour in the band above the prompt when
 * statusline-color is on, else as the plain line under it. Leaves the line as it was when anything throws.
 */
async function drawStatusLine($: EngineInterface, state: StatusLineState): Promise<void> {
  try {
    const usage = await $.session.usage()
    const fiveHour = usage.rateLimits.find(limit => limit.kind === 'five_hour')
    const branch = await outputOf($, ['git', 'branch', '--show-current'])
    const model = await $.session.model()
    if (state.drawnModel !== undefined && state.drawnModel !== model) state.effort = undefined
    state.drawnModel = model
    const { saved } = await syncSavedEffort($, state, model)
    const segments = buildStatusSegments({
      model,
      effort: state.effort ?? saved,
      contextPercent: usage.context.percent,
      contextTokens: usage.context.tokens,
      durationMs: (await $.clock.now()) - usage.startedAt,
      fiveHourPercent: fiveHour?.percentUsed,
      fiveHourResetsAt: fiveHour?.resetsAt,
      timezone: fiveHour?.resetsAt === undefined ? undefined : await resolveTimezone($, state),
      branch,
      cwd: await readCwd($),
    })
    if ((await readToggles($))['statusline-color']) {
      $.ui.status(undefined)
      state.segments = segments
      $.ui.invalidate('ui.render')
    } else {
      $.ui.status(segments.map(segment => segment.text).join(SEGMENT_SEPARATOR))
      if (state.segments !== undefined) {
        state.segments = undefined
        $.ui.invalidate('ui.render')
      }
    }
  } catch {
    // A failed measurement keeps the previous line.
  }
}

/** Redraws when settings.json names a different effort than at the last look: the effort picker has no event of its own. */
async function pollEffort($: EngineInterface, state: StatusLineState): Promise<void> {
  try {
    if (!(await readToggles($)).statusline) return
    const { isChanged } = await syncSavedEffort($, state, await $.session.model())
    if (isChanged) await drawStatusLine($, state)
  } catch {
    // The next poll tries again.
  }
}

async function playDone($: EngineInterface): Promise<void> {
  if (isWsl(await readProcVersion($), await $.env.get('WSL_DISTRO_NAME'))) {
    await runs($, wslCommand())
    return
  }
  for (const argv of ubuntuCommands()) if (await runs($, argv)) return
}

/** The files in a project's log folder; a folder not there yet, or unreadable, lists none. */
async function listLogFiles($: EngineInterface, dir: string): Promise<LogFile[]> {
  try {
    return (await $.fs.list(dir)).filter(entry => entry.kind === 'file').map(({ name, size }) => ({ name, size }))
  } catch {
    return []
  }
}

/**
 * Adds one line to a log file. A new file is written whole, its folder created; an existing one gets the
 * line from `tee -a`, since a read stops at 4 MiB and the file grows past it. A file planned as new that
 * already exists (its folder could not be listed) is appended to, never overwritten.
 */
async function appendLogLine($: EngineInterface, path: string, line: string, isNew: boolean): Promise<void> {
  if (isNew && !(await pathExists($, path))) return $.fs.write(path, line)
  const result = await $.process.run(['tee', '-a', path], { stdin: line })
  if (result.exitCode !== 0) throw new Error(result.stderr)
}

/** What a turn handler knows of a finished turn; the time, the session and, when no step named one, the model are read here. */
type FinishedTurn = Omit<LogEntry, 'at' | 'sessionId' | 'model'> & { model?: string }

/** Writes the finished turn to the log of the project the session is open in, then deletes what the size limits retire. Never throws: a log must not disturb a turn. */
async function logTurn($: EngineInterface, state: StatusLineState, turn: FinishedTurn): Promise<void> {
  try {
    const at = await $.clock.now()
    const dir = logDir(await readHome($), projectKey(await readCwd($)))
    const line = buildLogLine({ ...turn, at, sessionId: await $.session.id(), model: turn.model ?? (await $.session.model()) })
    const plan = planLogWrite(await listLogFiles($, dir), localDate(at, await resolveTimezone($, state)), line)
    await appendLogLine($, `${dir}/${plan.name}`, line, plan.isNew)
    for (const name of plan.remove) await runs($, ['rm', '-f', '--', `${dir}/${name}`])
  } catch {
    // A failed log write is dropped, and nothing is deleted.
  }
}

/** Opens the focused pane; when the engine refuses or defers it, a toast says why. The text list stays the answer either way. */
async function openPane($: EngineInterface): Promise<void> {
  try {
    const opened = await $.ui.open({ id: PANE_ID, title: 'c-mods', focus: true, closeOnEscape: true })
    if (!opened.isPlaced) $.ui.toast(`c-mods pane is not shown yet: ${opened.reason}`)
  } catch (e) {
    $.ui.toast(`c-mods pane could not open: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export const register: Register = on => {
  let isCavemanWarned = false
  let lastSoundAt: number | undefined
  /** The main-loop turn being logged; the model and effort are the last step's. */
  let turnLog: { prompt: string; commands: string[]; wasLogOn: boolean; model?: string; effort?: string | number } = { prompt: '', commands: [], wasLogOn: true }
  const statusLine: StatusLineState = { isTimezoneResolved: false, isSavedEffortSeen: false }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'c-mods', description: 'List or switch the c-mods functions', argumentHint: '[<name> on|off]' })
    const result = await next(e)
    if ((await readToggles($)).statusline) await drawStatusLine($, statusLine)
    $.clock.every(EFFORT_POLL_MS, () => void pollEffort($, statusLine))
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if ((await readToggles($)).statusline) await drawStatusLine($, statusLine)
    return result
  }).catch(($, e, next) => next(e))

  // A model or effort switch redraws at once; turn.start is the net for switches that reach neither (picker, fallback).
  on('command.run', { command: ['model', 'effort'] }, async ($, e, next) => {
    const result = await next(e)
    if (e.command === 'effort') statusLine.effort = undefined
    if ((await readToggles($)).statusline) await drawStatusLine($, statusLine)
    return result
  })

  on('config.set', { key: 'model' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && (await readToggles($)).statusline) await drawStatusLine($, statusLine)
    return result
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if ((await readToggles($)).statusline) await drawStatusLine($, statusLine)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    // The status line and the turn log both keep the main loop's latest step.
    if (e.agentId === undefined) {
      statusLine.effort = e.effort
      turnLog = { ...turnLog, model: e.model, effort: e.effort }
    }
    return yield* next(e)
  })

  on('command.run', { command: 'c-mods' }, async ($, e) => {
    const command = parseModsArgs(e.args)
    if (command.kind === 'usage') return { text: usageText() }
    if (command.kind === 'list') {
      await openPane($)
      return { text: listText(await readToggles($)) }
    }
    await applyToggle($, statusLine, command.name, command.isOn)
    return { text: `${command.name}: ${command.isOn ? 'on' : 'off'}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await readToggles($)
    return Box({
      flexDirection: 'column',
      children: TOGGLE_NAMES.map(name =>
        Box({
          key: `row-${name}`,
          children: [
            Text({ children: `${name}: ${current[name] ? 'on' : 'off'} ` }),
            Button({ key: name, label: current[name] ? 'turn off' : 'turn on', onPress: async () => applyToggle($, statusLine, name, !(await readToggles($))[name]) }),
          ],
        }),
      ),
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await readToggles($)
    const text = offBandText(current)
    const segments = current.statusline && current['statusline-color'] ? statusLine.segments : undefined
    if (text === undefined && (segments === undefined || segments.length === 0)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const offBand = text === undefined ? undefined : Text({ key: 'off-band', children: text })
    if (segments === undefined || segments.length === 0) return offBand
    const status = Box({
      key: 'status',
      children: segments.flatMap((segment, index) => [
        ...(index === 0 ? [] : [Text({ key: `sep-${index}`, dimColor: true, children: SEGMENT_SEPARATOR })]),
        Text({ key: `seg-${index}`, color: TONE_COLORS[segment.tone], bold: segment.tone.startsWith('model'), children: segment.text }),
      ]),
    })
    return Box({ flexDirection: 'column', children: offBand === undefined ? [status] : [status, offBand] })
  })

  // The four Bash guards share one handler: the engine asks only one `.catch` per call, so each guard
  // runs under its own catch here and a failure names the guard that failed. The first deny wins.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const denial =
      (await runBashGuard($, 'git-guard', async () => {
        const pattern = matchDangerous(executedText(e.command))
        return pattern === undefined ? undefined : { deny: blockedMessage(e.command, pattern) }
      })) ??
      (await runBashGuard($, 'dotenv-guard', async () => {
        const word = blockedEnvIn(executedText(e.command))
        return word === undefined ? undefined : { deny: bashBlockedMessage(word) }
      })) ??
      (await runBashGuard($, 'secret-guard', async () => {
        const home = await readHome($)
        for (const match of matchSecretCommand(executedText(e.command), home)) {
          if (isExtensionRule(match.rule) && !(await pathExists($, resolveCommandPath(match.path, home, await readCwd($))))) continue
          return { deny: secretBlockedMessage(match.path, match.rule) }
        }
        return undefined
      })) ??
      (await runBashGuard($, 'rm-guard', async () => {
        const pattern = matchRmDangerous(executedText(e.command), await readCwd($))
        return pattern === undefined ? undefined : { deny: rmBlockedMessage(e.command, pattern) }
      }))
    return denial ?? next(e)
  }).catch(($, e, next) => failClosed($, e, next, 'bash guards', 'command'))

  on('tool.call', { tool: [...DOTENV_FILE_TOOLS] }, async ($, e, next) => {
    if (!(await readToggles($))['dotenv-guard']) return next(e)
    return envPathDenial(e.file_path) ?? next(e)
  }).catch(($, e, next) => failClosed($, e, next, 'dotenv-guard', 'call'))

  on('tool.call', { tool: 'Grep' }, async ($, e, next) => {
    if (!(await readToggles($))['dotenv-guard']) return next(e)
    return envPathDenial(e.path) ?? next(e)
  }).catch(($, e, next) => failClosed($, e, next, 'dotenv-guard', 'call'))

  on('tool.call', { tool: [...SECRET_FILE_TOOLS] }, async ($, e, next) => {
    if (!(await readToggles($))['secret-guard']) return next(e)
    const path = typeof e.file_path === 'string' ? e.file_path : ''
    if (path === '') return next(e)
    const rule = matchSecretPath(path, await readHome($))
    return rule === undefined ? next(e) : { deny: secretBlockedMessage(path, rule) }
  }).catch(($, e, next) => failClosed($, e, next, 'secret-guard', 'call'))

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!(await readToggles($)).caveman) return result
    const text = await readCavemanSkill($)
    if (text === undefined) {
      if (!isCavemanWarned) {
        isCavemanWarned = true
        $.ui.toast(CAVEMAN_WARNING, { timeoutMs: 10000 })
      }
      return result
    }
    return { sections: [...result.sections, { id: 'c-mods:caveman', text, scope: 'session' }] }
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    turnLog = { prompt: e.text, commands: [], wasLogOn: (await readToggles($))['session-log'] }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result.deny === undefined && typeof e.command === 'string') turnLog.commands.push(e.command)
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const held = await readToggles($)
    if (e.agentId === undefined) {
      const { wasLogOn, ...entry } = turnLog
      turnLog = { prompt: '', commands: [], wasLogOn: true }
      const { usage } = e
      const tokens = usage && { input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cache_read_input_tokens, cacheCreation: usage.cache_creation_input_tokens }
      const turn = { ...entry, model: usage?.model ?? entry.model, turnId: e.turnId, reason: e.reason, durationMs: e.durationMs, tokens }
      if (wasLogOn && held['session-log']) await logTurn($, statusLine, turn)
    }
    if (e.agentId !== undefined || e.isAborted || !held.sound) return result
    const now = await $.clock.now()
    if (lastSoundAt !== undefined && now - lastSoundAt < SOUND_DEBOUNCE_MS) return result
    lastSoundAt = now
    await playDone($)
    return result
  }).catch(($, e, next) => next(e))
}
