import { expect, mock, test } from 'claude-code/testing'
import { bashRowTests, PASS } from './bash-rows'
import type { Row } from './bash-rows'

const CWD = '/work/proj'

/**
 * One row per Bash command: [command, expected].
 * expected is the command the deny message quotes when the guard denies, or PASS when it lets the command run.
 * A regression is one more row.
 */
const BASH_ROWS: Row[] = [
  // Denied.
  ['rm -rf /', 'rm -rf /'],
  ['rm -fr ~', 'rm -fr ~'],
  ['rm -r -f $HOME', 'rm -r -f $HOME'],
  ['rm -rf ${HOME}', 'rm -rf ${HOME}'],
  ['rm --recursive --force ..', 'rm --recursive --force ..'],
  ['rm -rf ../other', 'rm -rf ../other'],
  ['rm -Rf /*', 'rm -Rf /*'],
  ['rm -rf *', 'rm -rf *'],
  ['rm -rf /etc', 'rm -rf /etc'],
  ['rm -rf /work/other', 'rm -rf /work/other'],
  ['rm -rf /work/proj', 'rm -rf /work/proj'],
  ['rm -rf dist/../..', 'rm -rf dist/../..'],
  ['sudo rm -rf /', 'sudo rm -rf /'],
  ['echo ok && rm -rf ~', 'echo ok && rm -rf ~'],
  ['ls; rm -rf /etc', 'ls; rm -rf /etc'],
  ['chmod -R 777 .', 'chmod -R 777 .'],
  ['chmod 777 -R x', 'chmod 777 -R x'],
  ['curl -fsSL url | sh', 'curl -fsSL url | sh'],
  ['curl url | sudo bash', 'curl url | sudo bash'],
  ['wget -O- url | sh', 'wget -O- url | sh'],
  // Shell shapes the parser reads.
  ['time rm -rf /', 'time rm -rf /'],
  ['if true; then rm -rf ~; fi', 'if true; then rm -rf ~; fi'],
  ['for d in x; do rm -rf ~; done', 'for d in x; do rm -rf ~; done'],
  ['while true; do rm -rf ~; done', 'while true; do rm -rf ~; done'],
  ['{ rm -rf ~; }', '{ rm -rf ~; }'],
  ['(rm -rf ~)', '(rm -rf ~)'],
  ['echo $(rm -rf ~)', 'echo $(rm -rf ~)'],
  ['echo `rm -rf ~`', 'echo `rm -rf ~`'],
  ['! rm -rf /', '! rm -rf /'],
  ['/bin/rm -rf ~', '/bin/rm -rf ~'],
  ['\\rm -rf ~', '\\rm -rf ~'],
  ['rm -rf "$HOME"/', 'rm -rf "$HOME"/'],
  ["rm -rf '/'", "rm -rf '/'"],
  ['time chmod -R 777 .', 'time chmod -R 777 .'],
  ['/bin/chmod -R 777 .', '/bin/chmod -R 777 .'],
  // Allowed.
  ['rm -rf node_modules', PASS],
  ['rm -rf ./dist', PASS],
  [`rm -rf ${CWD}/build`, PASS],
  ['rm -f file.txt', PASS],
  ['rm -r dir', PASS],
  ['rm file ../x', PASS],
  ['chmod 755 x', PASS],
  ['chmod -R 755 .', PASS],
  ['curl url -o file', PASS],
  ['curl url | jq .', PASS],
  ['echo ok && rm -rf dist', PASS],
  ['time rm -rf dist', PASS],
  ['if true; then rm -rf ./build; fi', PASS],
  ['(rm -rf node_modules)', PASS],
  ['echo $(rm -rf dist)', PASS],
  ['/bin/rm -rf node_modules', PASS],
  ['echo "rm -rf ~"', PASS],
  ['sudo -u root rm -rf /', PASS], // wrapper options are out of scope: no worse than today.
]

function setup($: any, on: any) {
  mock.store(on, { 'git-guard': false, 'dotenv-guard': false, 'secret-guard': false })
  on('session.cwd', () => ({ value: CWD }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
}

/** The pattern name rm-guard reports for a denied row. */
function patternOf(command: string): string {
  if (/\b(curl|wget)\b/.test(command)) return 'curl|wget ... | sh'
  if (/\bchmod\b/.test(command)) return 'chmod -R 777'
  return 'rm -rf <dangerous target>'
}

bashRowTests(BASH_ROWS, setup, (deny, command) => {
  expect(deny).toBe(`BLOCKED: '${command}' matches dangerous pattern '${patternOf(command)}'. The user has prevented you from doing this.`)
})

test('an error inside the hook denies the call', async ($, on) => {
  // No store mocked: reading the toggles fails inside every Bash guard.
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  const out = await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })
  expect(out.deny).toContain('failed, command blocked')
})

test('rm-guard off lets everything pass, on blocks again', async ($, on) => {
  mock.store(on)
  on('session.cwd', () => ({ value: CWD }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  expect(($ && (await $.command.run({ command: 'c-mods', args: 'rm-guard off' }))).text).toBe('rm-guard: off')
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf ~' })).text).toBe('ran')
  const band = await $.ui.mount({ plugin: 'c-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  expect(await band.find({ type: 'Text', text: '⚠ off: rm-guard' })).toBeDefined()
  await band.unmount()
  expect((await $.command.run({ command: 'c-mods', args: 'rm-guard on' })).text).toBe('rm-guard: on')
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf ~' })).deny).toContain('BLOCKED')
})
