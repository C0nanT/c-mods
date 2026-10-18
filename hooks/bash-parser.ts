/**
 * Shell-text parsing for the Bash guards: words with their quotes removed, redirects, heredoc bodies and
 * command substitutions, grouped into pipelines of simple commands. It knows the shell's grammar, not
 * what programs do with their arguments; that is decided in `bash-text-rules`. One exception: a
 * `$(cat <<'EOF' ... EOF)` substitution is read as inert text, not as code. A command it cannot parse
 * with confidence throws `Unparsable`, so callers can fall back to the whole command.
 */

export type Word = {
  start: number
  end: number
  /** The word with its quotes removed. */
  value: string
  isQuoted: boolean
  /** True when the word holds a command substitution, which runs whatever command it holds. */
  runsCode: boolean
  /** The command text of each substitution the word holds, as the shell will run it. */
  substitutions: string[]
  /** True when the word holds an unquoted `*`, `?` or `[`, which the shell may expand to file names. */
  hasGlob: boolean
  isRedirectTarget: boolean
}

export type Heredoc = {
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

export type SimpleCommand = { words: Word[]; heredocs: Heredoc[] }

/** Thrown when the command cannot be parsed with confidence; the whole command is then analysed. */
export class Unparsable extends Error {}

const OPERATORS = ['<<<', '<<-', '&&', '||', '|&', ';;', '<<', '>>', '>&', '<&', '&>', '>|', '<>', '|', ';', '&', '(', ')', '<', '>']
const REDIRECTS = ['<<<', '>>', '>&', '<&', '&>', '>|', '<>', '<', '>']
/** `$(cat <<'EOF' ... EOF)`: a quoted heredoc printed by cat, so nothing in it runs. */
const QUOTED_CAT_HEREDOC = /\$\(\s*cat\s*<<-?\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\n([\s\S]*?\n)?\2\n\s*\)/y

/** The pipelines of a command string, each a list of simple commands; throws `Unparsable` when unsure. */
export function parse(command: string): SimpleCommand[][] {
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
  const substitutions: string[] = []
  let hasGlob = false
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
          substitutions.push(...expansion.substitutions)
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
      substitutions.push(...expansion.substitutions)
      i = expansion.end
    } else {
      value += char
      hasGlob ||= '*?['.includes(char)
      i++
    }
  }
  return { start, end: i, value, isQuoted, runsCode, substitutions, hasGlob }
}

type Expansion = { text: string; end: number; runsCode: boolean; substitutions: string[] }

/** A `$`, `${...}`, `$(...)` or backtick expansion starting at `start`, with the command text of the substitutions it holds. */
function readExpansion(command: string, start: number): Expansion {
  if (command[start] === '`') {
    const end = skipEscaped(command, start + 1, '`')
    // Inside backticks, a backslash before `, $ or \ only escapes it.
    const inner = command.slice(start + 1, end - 1).replace(/\\([`$\\])/g, '$1')
    return { text: command.slice(start, end), end, runsCode: true, substitutions: [inner] }
  }
  if (command[start + 1] === '(') {
    QUOTED_CAT_HEREDOC.lastIndex = start
    const quotedCat = QUOTED_CAT_HEREDOC.exec(command)
    if (quotedCat !== null) return { text: quotedCat[3] ?? '', end: QUOTED_CAT_HEREDOC.lastIndex, runsCode: false, substitutions: [] }
    const end = skipBalanced(command, start + 2, '(', ')')
    return { text: command.slice(start, end), end, runsCode: true, substitutions: [command.slice(start + 2, end - 1)] }
  }
  if (command[start + 1] === '{') {
    const end = skipBalanced(command, start + 2, '{', '}')
    const text = command.slice(start, end)
    const substitutions = substitutionsIn(command.slice(start + 2, end - 1))
    return { text, end, runsCode: substitutions.length > 0, substitutions }
  }
  return { text: '$', end: start + 1, runsCode: false, substitutions: [] }
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

/**
 * The commands held by the `$(...)` and backtick substitutions of an unquoted heredoc body, which bash runs
 * while it reads the body, whatever program the body is fed to. Quotes are plain text in the body, so only
 * a backslash escapes; inside a substitution the shell's quoting holds again. A `${...}` is searched too,
 * as is the inside of a `${...}` in a word. Throws `Unparsable` when a substitution is not closed.
 */
export function substitutionsIn(body: string): string[] {
  const found: string[] = []
  for (let i = 0; i < body.length; i++) {
    const char = body.charAt(i)
    if (char === '\\') i++
    else if (char === '`') {
      const end = skipEscaped(body, i + 1, '`')
      found.push(body.slice(i + 1, end - 1))
      i = end - 1
    } else if (char === '$' && body[i + 1] === '(') {
      const end = skipBalanced(body, i + 2, '(', ')')
      found.push(body.slice(i + 2, end - 1))
      i = end - 1
    } else if (char === '$' && body[i + 1] === '{') {
      const end = skipBalanced(body, i + 2, '{', '}')
      found.push(...substitutionsIn(body.slice(i + 2, end - 1)))
      i = end - 1
    }
  }
  return found
}

/** The part after the last `/`, ignoring trailing slashes. */
export const basename = (value: string) => value.split('/').filter(Boolean).pop() ?? ''
