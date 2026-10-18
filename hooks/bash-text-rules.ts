/**
 * The text of a Bash command that the shell executes, for the Bash guards to match against. Inert spans
 * are removed: heredoc bodies fed to `cat`, `tee`, an interpreter or `git commit`, `git commit` messages,
 * and the code of `node -e`, `python -c`, `ruby -e` and `perl -e`, as long as the pipeline after them
 * only prints or counts text. Every other program keeps its text, so an unknown one never opens a hole.
 * Anything that reaches a shell (`bash <<EOF`, `sh -c '...'`, `eval '...'`, `... | bash`) is kept, and its
 * quoted text is appended as a command of its own. A command `bash-parser` cannot parse with confidence is
 * returned whole, so the guards stay closed.
 */
import { basename, parse, Unparsable } from './bash-parser'
import type { SimpleCommand, Word } from './bash-parser'

/** Programs that run text they are given: their heredocs and quoted words are analysed as commands. */
export const SHELLS = ['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'fish', 'eval', 'source', 'ssh', 'su']
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

/** The spans of one command that the shell does not execute: interpreter code, commit messages, heredocs fed to a reader. */
function inertSpans(command: SimpleCommand): { start: number; end: number }[] {
  const program = programOf(command)
  if (program === undefined) return []
  const flags = /^python[0-9.]*$/.test(program.name) ? ['-c'] : INTERPRETER_CODE_FLAGS[program.name]
  const commit = program.name === 'git' ? commitArgs(program.args) : undefined
  const words = flags !== undefined ? interpreterCode(flags, program.args) : commit !== undefined ? commitMessages(commit) : []
  const readsHeredoc = flags !== undefined || commit !== undefined || HEREDOC_READERS.includes(program.name)
  return [...words.filter(word => !word.runsCode), ...(readsHeredoc ? command.heredocs.filter(heredoc => !heredoc.runsCode) : [])]
}

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
      if (index <= lastShell) shellText.push(...simple.words.filter(word => word.isQuoted).map(word => word.value))
      else if (feedsOnlyReaders(pipeline, index)) spans.push(...inertSpans(simple))
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
 * shell runs is read as commands too: the heredoc bodies of a pipeline that feeds a shell, and command
 * substitutions. Quoted text passed to a shell is not, since `executedText` appends it already.
 */
export function simpleCommands(command: string): ShellCommand[] | undefined {
  try {
    return commandsOf(command)
  } catch (e) {
    if (e instanceof Unparsable) return undefined
    throw e
  }
}

/** The pipelines of a command string, each as its simple commands in order; undefined when it cannot be parsed with confidence. */
export function pipelineCommands(command: string): ShellCommand[][] | undefined {
  try {
    return parse(command).map(pipeline => pipeline.map(shellCommand))
  } catch (e) {
    if (e instanceof Unparsable) return undefined
    throw e
  }
}

function commandsOf(command: string): ShellCommand[] {
  const commands: ShellCommand[] = []
  for (const pipeline of parse(command)) {
    const lastShell = pipeline.findLastIndex(isShell)
    pipeline.forEach((simple, index) => {
      commands.push(shellCommand(simple))
      for (const word of simple.words) {
        if (word.runsCode) commands.push(...commandsOf(word.value.replace(/\$\(|\)|`/g, '\n')))
      }
      if (index <= lastShell) {
        for (const heredoc of simple.heredocs) commands.push(...commandsOf(command.slice(heredoc.start, heredoc.bodyEnd)))
      }
    })
  }
  return commands
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
