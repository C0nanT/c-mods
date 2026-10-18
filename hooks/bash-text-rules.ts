/**
 * The text of a Bash command that the shell executes, for the Bash guards to match against. Inert spans
 * are removed: heredoc bodies fed to `cat`, `tee`, an interpreter or `git commit`, `git commit` messages,
 * and the code of `node -e`, `python -c`, `ruby -e` and `perl -e`, as long as the pipeline after them
 * only prints or counts text. Every other program keeps its text, so an unknown one never opens a hole.
 * Anything that reaches a shell (`bash <<EOF`, `sh -c '...'`, `eval '...'`, `... | bash`, `watch '...'`) is
 * kept, and its quoted text is appended as a command of its own. A command `bash-parser` cannot parse with
 * confidence is returned whole, so the guards stay closed.
 */
import { basename, parse, substitutionsIn, Unparsable } from './bash-parser'
import type { SimpleCommand, Word } from './bash-parser'

/** Programs that run text they are given: their heredocs and quoted words are analysed as commands. */
export const SHELLS = ['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'fish', 'eval', 'source', 'ssh', 'su']
/** Programs that run their arguments as shell text, though not their stdin: their quoted words are analysed as commands. */
const ARGUMENT_SHELLS = ['watch']
/** Programs whose heredoc body is inert, besides the interpreters and `git commit`. */
const HEREDOC_READERS = ['cat', 'tee']
/** Programs that may follow an inert span in a pipeline: they print or count text, never run it. */
const PIPE_READERS = ['cat', 'tee', 'head', 'tail', 'wc', 'sort', 'uniq', 'grep', 'less']
const WRAPPERS = ['sudo', 'command', 'env', 'exec', 'nohup', 'time', '!', '{', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']
const NODE_CODE_FLAGS = ['-e', '--eval', '-p', '--print']
const INTERPRETER_CODE_FLAGS: Record<string, readonly string[]> = {
  node: NODE_CODE_FLAGS,
  nodejs: NODE_CODE_FLAGS,
  bun: NODE_CODE_FLAGS,
  ruby: ['-e'],
  perl: ['-e', '-E'],
}
/** `git commit` short flags that take no value, and those that take one; `m` is handled on its own. */
const COMMIT_BOOLEAN_FLAGS = 'apzsneiovq'
const COMMIT_VALUE_FLAGS = 'CcFt'

/** The index of the program among a command's words, past `VAR=x` assignments and wrappers; -1 when there is none. */
const programIndex = (words: readonly string[]) =>
  words.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && !WRAPPERS.includes(word))

/** A command's words split around the program, past `VAR=x` assignments and wrappers such as `sudo`; redirect targets left out. */
function splitAtProgram(command: SimpleCommand): { prefix: Word[]; program: Word | undefined; args: Word[] } {
  const words = command.words.filter(word => !word.isRedirectTarget)
  const found = programIndex(words.map(word => word.value))
  const start = found === -1 ? words.length : found
  return { prefix: words.slice(0, start), program: words[start], args: words.slice(start + 1) }
}

/** The program's base name and its arguments; undefined when the command has no program. */
function programOf(command: SimpleCommand): { name: string; args: Word[] } | undefined {
  const { program, args } = splitAtProgram(command)
  return program === undefined ? undefined : { name: basename(program.value), args }
}

/** True when any word names a shell, or the program is `.` (as an argument, `.` is the current directory). */
function isShell(command: SimpleCommand): boolean {
  return programOf(command)?.name === '.' || command.words.some(word => SHELLS.includes(basename(word.value)))
}

function interpreterCode(flags: readonly string[], args: readonly Word[]): Word[] {
  const code: Word[] = []
  const rest = [...args]
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    const value = word.value
    if (flags.includes(value)) code.push(...rest.splice(0, 1))
    else if (flags.some(flag => flag.startsWith('--') && value.startsWith(`${flag}=`))) code.push(word)
    else if (!value.startsWith('-')) break
  }
  return code
}

/** The words after `commit` in a `git commit` command, past git's own options; undefined for any other git command. */
function commitArgs(args: readonly Word[]): Word[] | undefined {
  const rest = [...args]
  for (let word = rest.shift(); word !== undefined; word = rest.shift()) {
    if (word.value === '-c' || word.value === '-C') rest.shift()
    else if (!word.value.startsWith('-')) return word.value === 'commit' ? rest : undefined
  }
  return undefined
}

function commitMessages(args: readonly Word[]): Word[] {
  const messages: Word[] = []
  const rest = [...args]
  for (let word = rest.shift(); word !== undefined && word.value !== '--'; word = rest.shift()) {
    const value = word.value
    if (value === '-m' || value === '--message') messages.push(...rest.splice(0, 1))
    else if (value.startsWith('--message=')) messages.push(word)
    else if (/^-[^-]/.test(value)) {
      const flags = value.slice(1)
      for (const [index, flag] of [...flags].entries()) {
        const isLast = index === flags.length - 1
        if (flag === 'm') {
          messages.push(...(isLast ? rest.splice(0, 1) : [word]))
          break
        }
        if (COMMIT_VALUE_FLAGS.includes(flag)) {
          if (isLast) rest.shift()
          break
        }
        if (!COMMIT_BOOLEAN_FLAGS.includes(flag)) break
      }
    }
  }
  return messages
}

/** What one command reads as text rather than runs: interpreter code or commit messages, and whether its heredoc is text. */
function readsAsText(command: SimpleCommand): { words: Word[]; readsHeredoc: boolean } {
  const program = programOf(command)
  if (program === undefined) return { words: [], readsHeredoc: false }
  const flags = /^python[0-9.]*$/.test(program.name) ? ['-c'] : INTERPRETER_CODE_FLAGS[program.name]
  const commit = program.name === 'git' ? commitArgs(program.args) : undefined
  const words = flags !== undefined ? interpreterCode(flags, program.args) : commit !== undefined ? commitMessages(commit) : []
  return { words, readsHeredoc: flags !== undefined || commit !== undefined || HEREDOC_READERS.includes(program.name) }
}

/** The spans of one command that the shell does not execute: interpreter code, commit messages, heredocs fed to a reader. */
function inertSpans(command: SimpleCommand): { start: number; end: number }[] {
  const { words, readsHeredoc } = readsAsText(command)
  return [...words.filter(word => !word.runsCode), ...(readsHeredoc ? command.heredocs.filter(heredoc => !heredoc.runsCode) : [])]
}

/** True when the inert spans of the command at `index` are left out of the executed text; see `executedText`. */
const isInertAt = (pipeline: readonly SimpleCommand[], index: number, lastShell: number) =>
  index > lastShell && feedsOnlyReaders(pipeline, index)

/**
 * True when the heredoc bodies of the command at `index` may run: the command, or one later in the pipeline,
 * is a shell or a program that is not known to read its heredoc as text (`at`, `sudo -s`, `make -f -`).
 */
const runsHeredocAt = (pipeline: readonly SimpleCommand[], index: number, lastShell: number) =>
  !isInertAt(pipeline, index, lastShell) || !readsAsText(pipeline[index]).readsHeredoc

/** The quoted words a shell may run as commands: those of a shell's pipeline up to the shell, and those of `watch`. */
const runsQuotedWordsAt = (pipeline: readonly SimpleCommand[], index: number, lastShell: number) =>
  index <= lastShell || ARGUMENT_SHELLS.includes(programOf(pipeline[index])?.name ?? '')

/** True when every command after `index` only prints or counts the text it is piped. */
function feedsOnlyReaders(pipeline: readonly SimpleCommand[], index: number): boolean {
  return pipeline.slice(index + 1).every(command => PIPE_READERS.includes(programOf(command)?.name ?? ''))
}

/** The text the shell executes; see the module comment. */
export function executedText(command: string): string {
  let pipelines: SimpleCommand[][]
  try {
    pipelines = parse(command)
  } catch (e) {
    if (e instanceof Unparsable) return command
    throw e
  }
  const spans: { start: number; end: number }[] = []
  const shellText: string[] = []
  for (const pipeline of pipelines) {
    const lastShell = pipeline.findLastIndex(isShell)
    pipeline.forEach((simple, index) => {
      if (runsQuotedWordsAt(pipeline, index, lastShell)) shellText.push(...simple.words.filter(word => word.isQuoted).map(word => word.value))
      if (isInertAt(pipeline, index, lastShell)) spans.push(...inertSpans(simple))
    })
  }
  spans.sort((a, b) => a.start - b.start)
  let text = ''
  let at = 0
  for (const span of spans) {
    text += command.slice(at, span.start)
    at = Math.max(at, span.end)
  }
  text += command.slice(at)
  return [text, ...shellText].join('\n')
}

/** One simple command as the shell reads it, quotes removed and quoted text kept as one word. */
export type ShellCommand = {
  /** The `VAR=x` assignments and wrappers such as `sudo` before the program. */
  prefix: string[]
  /** The program word as written, or undefined when the command holds only a prefix or redirects. */
  program: string | undefined
  args: string[]
  redirects: string[]
  /** The words, from any of the above, that hold an unquoted wildcard the shell may expand. */
  globs: string[]
}

/**
 * The simple commands of a command string, or undefined when it cannot be parsed with confidence. Text a
 * shell runs is read as commands too (see `pipelineCommands`).
 */
export function simpleCommands(command: string): ShellCommand[] | undefined {
  return pipelineCommands(command)?.flat()
}

/**
 * The pipelines of a command string, each as its simple commands in order; undefined when it cannot be parsed
 * with confidence. Text a shell runs is read as pipelines of its own, after the pipeline that holds it: command
 * substitutions, and the heredoc bodies fed to a shell or to a program not known to read them as text, such
 * as `at` or `sudo -s` (the bodies `executedText` keeps, bar a text body that holds a substitution). In an
 * unquoted body read as text, the substitutions are still read, since bash runs them while reading the body.
 * The arguments of `watch` are read as the command it runs. A body or substitution that cannot be parsed makes
 * the whole command unparsable. Quoted text passed to a shell is not, since `executedText` appends it already.
 */
export function pipelineCommands(command: string): ShellCommand[][] | undefined {
  try {
    return pipelinesOf(command)
  } catch (e) {
    if (e instanceof Unparsable) return undefined
    throw e
  }
}

function pipelinesOf(command: string): ShellCommand[][] {
  const pipelines: ShellCommand[][] = []
  for (const pipeline of parse(command)) {
    const lastShell = pipeline.findLastIndex(isShell)
    const nested: ShellCommand[][] = []
    pipeline.forEach((simple, index) => {
      for (const word of simple.words) {
        nested.push(...word.substitutions.flatMap(pipelinesOf))
      }
      const runsBodies = runsHeredocAt(pipeline, index, lastShell)
      for (const heredoc of simple.heredocs) {
        const body = command.slice(heredoc.start, heredoc.bodyEnd)
        if (runsBodies) nested.push(...pipelinesOf(body))
        else if (heredoc.runsCode) nested.push(...substitutionsIn(body).flatMap(pipelinesOf))
      }
      const watched = watchedCommand(simple)
      if (watched !== undefined) nested.push(...pipelinesOf(watched))
    })
    pipelines.push(pipeline.map(shellCommand), ...nested)
  }
  return pipelines
}

/** `watch` options that take the next word as their value. */
const WATCH_VALUE_OPTIONS = ['-n', '--interval', '-q', '--equexit']

/**
 * The shell text an `ARGUMENT_SHELLS` program runs: its arguments past its own options, joined with spaces as
 * `watch` joins them before it hands them to `sh -c`; undefined for any other program.
 */
function watchedCommand(command: SimpleCommand): string | undefined {
  const program = programOf(command)
  if (program === undefined || !ARGUMENT_SHELLS.includes(program.name)) return undefined
  const rest = program.args.map(word => word.value)
  while (rest.length > 0 && rest[0].startsWith('-')) {
    const option = rest.shift()
    if (option === '--') break
    if (WATCH_VALUE_OPTIONS.includes(option ?? '')) rest.shift()
  }
  return rest.join(' ')
}

function shellCommand(command: SimpleCommand): ShellCommand {
  const { prefix, program, args } = splitAtProgram(command)
  const values = (words: readonly Word[]) => words.map(word => word.value)
  return {
    prefix: values(prefix),
    program: program?.value,
    args: values(args),
    redirects: values(command.words.filter(word => word.isRedirectTarget)),
    globs: values(command.words.filter(word => word.hasGlob)),
  }
}
