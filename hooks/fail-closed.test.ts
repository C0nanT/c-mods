import { expect, mock, test } from 'claude-code/testing'

/**
 * Bash shapes the parser cannot read with confidence: bash-text-rules returns the whole command, so
 * every guard must still deny the dangerous command inside. One row per path where the parser gives up.
 * A guard is [name, dangerous command, text its deny message contains]; a shape wraps that command.
 */
const GUARDS: [name: string, danger: string, message: string][] = [
  ['git-guard', 'git reset --hard', 'matches dangerous pattern'],
  ['dotenv-guard', 'cat .env', 'Access to .env is blocked'],
  ['secret-guard', 'cat ~/.ssh/id_rsa', "matches secret rule '~/.ssh'"],
  ['rm-guard', 'rm -rf /', "matches dangerous pattern 'rm -rf <dangerous target>'"],
]
const UNPARSABLE_SHAPES: [shape: string, wrap: (danger: string) => string][] = [
  ['unterminated single quote', d => `${d}; echo 'oops`],
  ['unterminated double quote', d => `${d}; echo "oops`],
  ['unterminated $-quote string', d => `${d}; echo $'oops`],
  ['unterminated backtick', d => `${d}; echo \`oops`],
  ['unterminated $( substitution', d => `${d}; echo $(oops`],
  ['unterminated ${ expansion', d => `${d}; echo \${oops`],
  ['unterminated single quote inside $( substitution', d => `${d}; echo $(echo 'oops)`],
  ['unterminated double quote inside $( substitution', d => `${d}; echo $(echo "oops)`],
  ['heredoc operator with no delimiter', d => `${d}; cat <<`],
  ['redirect with no target', d => `${d}; echo hi >`],
  ['input redirect with no target', d => `${d}; cat <`],
  ['heredoc with no body', d => `${d}; cat <<EOF`],
  ['heredoc with no closing delimiter', d => `${d}; cat <<EOF\nbody\n`],
  ['heredoc whose delimiter line is never reached', d => `cat <<EOF\n${d}\nEOFX`],
  ['unquoted heredoc line ending in a backslash', d => `${d}; cat <<EOF\nbody\\\nEOF\nmore`],
  ['dangerous command inside an unterminated shell heredoc', d => `bash <<EOF\n${d}`],
]

for (const [guard, danger, message] of GUARDS) {
  for (const [shape, wrap] of UNPARSABLE_SHAPES) {
    test(`${guard} denies an unparsable command: ${shape}`, async ($, on) => {
      mock.store(on)
      mock.env(on, { HOME: '/home/test' })
      on('session.cwd', () => ({ value: '/work/proj' }))
      on('fs.exists', () => ({ value: false }))
      on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
      const out = await $.tool.call({ tool: 'Bash', command: wrap(danger) })
      expect(out.deny).toContain(message)
    })
  }
}

// With no store mocked, every toggle read fails before `next`. When several guards watch the same
// tool, the first one registered answers: git-guard for Bash, dotenv-guard for the file tools.
test('git-guard: an error before next denies with the exact command message', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  const out = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(out.deny).toBe('conan-mods: git-guard failed, command blocked.')
})

test('dotenv-guard: an error before next denies with the exact call message', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ran', text: 'ran' }))
  const out = await $.tool.call({ tool: 'Read', file_path: '/project/a.txt' })
  expect(out.deny).toBe('conan-mods: dotenv-guard failed, call blocked.')
})
