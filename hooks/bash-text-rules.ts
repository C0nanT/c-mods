/**
 * The text of a Bash command that the shell executes, for the Bash guards to match against. Inert spans
 * are removed: heredoc bodies fed to `cat`, `tee`, an interpreter or `git commit`, `git commit` messages,
 * and the code of `node -e`, `python -c`, `ruby -e` and `perl -e`, as long as the pipeline after them
 * only prints or counts text. Every other program keeps its text, so an unknown one never opens a hole.
 * Anything that reaches a shell (`bash <<EOF`, `sh -c '...'`, `eval '...'`, `... | bash`) is kept, and its
 * quoted text is appended as a command of its own. A command this module cannot parse with confidence is
 * returned whole, so the guards stay closed.
 */

type Word = {
  start: number
  end: number
  /** The word with its quotes removed. */
  value: string
  isQuoted: boolean
  /** True when the word holds a command substitution, which runs whatever command it holds. */
  runsCode: boolean
  isRedirectTarget: boolean
}

type Heredoc = {
  delimiter: string
  stripsTabs: boolean
  isQuoted: boolean
  /** From the first body line to the end of the delimiter line; set once the body is read. */
  start: number
  end: number
  /** Where the delimiter line starts, so the body is `start` to `bodyEnd`. */
  bodyEnd: number
  /** True when an unquoted body holds a command substitution, which the shell runs while reading it. */
  runsCode: boolean
}

type SimpleCommand = { words: Word[]; heredocs: Heredoc[] }

/** Thrown when the command cannot be parsed with confidence; the whole command is then analysed. */
class Unparsable extends Error {}

/** Programs that run text they are given: their heredocs and quoted words are analysed as commands. */
const SHELLS = ['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'fish', 'eval', 'source', '.', 'ssh', 'su']
/** Programs whose heredoc body is inert, besides the interpreters and `git commit`. */
const HEREDOC_READERS = ['cat', 'tee']
/** Programs that may follow an inert span in a pipeline: they print or count text, never run it. */
const PIPE_READERS = ['cat', 'tee', 'head', 'tail', 'wc', 'sort', 'uniq', 'grep', 'less']
const WRAPPERS = ['sudo', 'command', 'env', 'exec', 'nohup', 'time', '!', '{', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']
const OPERATORS = ['<<<', '<<-', '&&', '||', '|&', ';;', '<<', '>>', '>&', '<&', '&>', '>|', '<>', '|', ';', '&', '(', ')', '<', '>']
const REDIRECTS = ['<<<', '>>', '>&', '<&', '&>', '>|', '<>', '<', '>']
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
/** `$(cat <<'EOF' ... EOF)`: a quoted heredoc printed by cat, so nothing in it runs. */
const QUOTED_CAT_HEREDOC = /\$\(\s*cat\s*<<-?\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\n([\s\S]*?\n)?\2\n\s*\)/y

function parse(command: string): SimpleCommand[][] {
  const pipelines: SimpleCommand[][] = []
  let pipeline: SimpleCommand[] = []
  let current: SimpleCommand = { words: [], heredocs: [] }
  let pending: Heredoc[] = []
  let delimiterFor: Heredoc | undefined
  let isRedirectNext = false
  let i = 0

  const endCommand = () => {
    if (delimiterFor !== undefined || isRedirectNext) throw new Unparsable()
    if (current.words.length > 0 || current.heredocs.length > 0) pipeline.push(current)
    current = { words: [], heredocs: [] }
  }
  const endPipeline = () => {
    endCommand()
    if (pipeline.length > 0) pipelines.push(pipeline)
    pipeline = []
  }

  while (i < command.length) {
    const char = command.charAt(i)
    if (char === ' ' || char === '\t') i++
    else if (char === '\\' && command[i + 1] === '\n') i += 2
    else if (char === '\n') {
      endPipeline()
      i = readBodies(command, i + 1, pending)
      pending = []
    } else if (char === '#') {
      const end = command.indexOf('\n', i)
      i = end === -1 ? command.length : end
    } else {
      const operator = OPERATORS.find(op => command.startsWith(op, i))
      if (operator !== undefined) {
        i += operator.length
        if (operator === '<<' || operator === '<<-') {
          delimiterFor = { delimiter: '', stripsTabs: operator === '<<-', isQuoted: false, start: -1, end: -1, bodyEnd: -1, runsCode: false }
          current.heredocs.push(delimiterFor)
          pending.push(delimiterFor)
        } else if (REDIRECTS.includes(operator)) isRedirectNext = true
        else if (operator === '|' || operator === '|&') endCommand()
        else endPipeline()
        continue
      }
      const word = readWord(command, i)
      if (delimiterFor !== undefined) {
        delimiterFor.delimiter = word.value
        delimiterFor.isQuoted = word.isQuoted
        delimiterFor = undefined
      } else {
        current.words.push({ ...word, isRedirectTarget: isRedirectNext })
        isRedirectNext = false
      }
      i = word.end
    }
  }
  if (pending.length > 0) throw new Unparsable()
  endPipeline()
  return pipelines
}

/** Reads the bodies of the heredocs opened on the line that ended just before `start`; returns where the next line starts. */
function readBodies(command: string, start: number, heredocs: readonly Heredoc[]): number {
  let i = start
  for (const heredoc of heredocs) {
    heredoc.start = i
    for (;;) {
      if (i >= command.length) throw new Unparsable()
      const newline = command.indexOf('\n', i)
      const lineEnd = newline === -1 ? command.length : newline
      const line = command.slice(i, lineEnd)
      // Unquoted, bash joins a line ending in `\` to the next before it looks for the delimiter.
      if (!heredoc.isQuoted && /(^|[^\\])(\\\\)*\\$/.test(line)) throw new Unparsable()
      if ((heredoc.stripsTabs ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) {
        heredoc.end = lineEnd
        heredoc.bodyEnd = i
        heredoc.runsCode = !heredoc.isQuoted && /\$\(|`/.test(command.slice(heredoc.start, i))
        i = lineEnd + 1
        break
      }
      i = lineEnd + 1
    }
  }
  return Math.min(i, command.length)
}

function readWord(command: string, start: number): Omit<Word, 'isRedirectTarget'> {
  let value = ''
  let isQuoted = false
  let runsCode = false
  let i = start
  while (i < command.length) {
    const char = command.charAt(i)
    if (' \t\n'.includes(char) || OPERATORS.some(op => command.startsWith(op, i))) break
    if (char === "'") {
      const close = command.indexOf("'", i + 1)
      if (close === -1) throw new Unparsable()
      value += command.slice(i + 1, close)
      isQuoted = true
      i = close + 1
    } else if (char === '$' && command[i + 1] === "'") {
      const close = skipEscaped(command, i + 2, "'")
      value += command.slice(i + 2, close - 1)
      isQuoted = true
      i = close
    } else if (char === '"') {
      i++
      isQuoted = true
      for (;;) {
        if (i >= command.length) throw new Unparsable()
        const inner = command.charAt(i)
        if (inner === '"') break
        if (inner === '\\') {
          value += command.slice(i, i + 2)
          i += 2
        } else if (inner === '$' || inner === '`') {
          const expansion = readExpansion(command, i)
          value += expansion.text
          runsCode ||= expansion.runsCode
          i = expansion.end
        } else {
          value += inner
          i++
        }
      }
      i++
    } else if (char === '\\') {
      value += command[i + 1] ?? ''
      isQuoted = true
      i += 2
    } else if (char === '$' || char === '`') {
      const expansion = readExpansion(command, i)
      value += expansion.text
      runsCode ||= expansion.runsCode
      i = expansion.end
    } else {
      value += char
      i++
    }
  }
  return { start, end: i, value, isQuoted, runsCode }
}

/** A `$`, `${...}`, `$(...)` or backtick expansion starting at `start`. */
function readExpansion(command: string, start: number): { text: string; end: number; runsCode: boolean } {
  if (command[start] === '`') {
    const end = skipEscaped(command, start + 1, '`')
    return { text: command.slice(start, end), end, runsCode: true }
  }
  if (command[start + 1] === '(') {
    QUOTED_CAT_HEREDOC.lastIndex = start
    const quotedCat = QUOTED_CAT_HEREDOC.exec(command)
    if (quotedCat !== null) return { text: quotedCat[3] ?? '', end: QUOTED_CAT_HEREDOC.lastIndex, runsCode: false }
    const end = skipBalanced(command, start + 2, '(', ')')
    return { text: command.slice(start, end), end, runsCode: true }
  }
  if (command[start + 1] === '{') {
    const end = skipBalanced(command, start + 2, '{', '}')
    const text = command.slice(start, end)
    return { text, end, runsCode: /\$\(|`/.test(text) }
  }
  return { text: '$', end: start + 1, runsCode: false }
}

/** The index just past the unescaped `close` found from `start`. */
function skipEscaped(command: string, start: number, close: string): number {
  for (let i = start; i < command.length; i++) {
    if (command[i] === '\\') i++
    else if (command[i] === close) return i + 1
  }
  throw new Unparsable()
}

/** The index just past the `close` that balances an already opened `open`, skipping quoted text. */
function skipBalanced(command: string, start: number, open: string, close: string): number {
  let depth = 1
  for (let i = start; i < command.length; i++) {
    const char = command.charAt(i)
    if (char === '\\') i++
    else if (char === "'") {
      i = command.indexOf("'", i + 1)
      if (i === -1) throw new Unparsable()
    } else if (char === '"' || char === '`') i = skipEscaped(command, i + 1, char) - 1
    else if (char === open) depth++
    else if (char === close && --depth === 0) return i + 1
  }
  throw new Unparsable()
}

/** The index of the program among a command's words, past `VAR=x` assignments and wrappers; -1 when there is none. */
const programIndex = (words: readonly string[]) =>
  words.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && !WRAPPERS.includes(word))

const basename = (value: string) => value.split('/').pop() ?? ''

function isShell(command: SimpleCommand): boolean {
  return command.words.some(word => SHELLS.includes(basename(word.value)))
}

/** The program and its arguments, past `VAR=x` assignments, wrappers such as `sudo`, and redirect targets. */
function programOf(command: SimpleCommand): { name: string; args: Word[] } | undefined {
  const words = command.words.filter(word => !word.isRedirectTarget)
  const start = programIndex(words.map(word => word.value))
  const program = words[start]
  return program === undefined ? undefined : { name: basename(program.value), args: words.slice(start + 1) }
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
  const words = command.words.filter(word => !word.isRedirectTarget).map(word => word.value)
  const found = programIndex(words)
  const start = found === -1 ? words.length : found
  return {
    prefix: words.slice(0, start),
    program: words[start],
    args: words.slice(start + 1),
    redirects: command.words.filter(word => word.isRedirectTarget).map(word => word.value),
  }
}
