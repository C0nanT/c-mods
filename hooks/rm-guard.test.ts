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
]

function setup($: any, on: any) {
  mock.store(on)
  on('session.cwd', () => ({ value: CWD }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
}

bashRowTests(BASH_ROWS, setup, (deny, command) => {
  expect(deny).toContain(`BLOCKED: '${command}' matches dangerous pattern '`)
  expect(deny).toContain("'. The user has prevented you from doing this.")
})

test('an error inside the hook denies the call', async ($, on) => {
  // No store mocked: reading the toggles fails inside every Bash guard.
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
  const out = await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })
  expect(out.deny).toContain('failed, command blocked')
})

test('rm-guard off lets everything pass, on blocks again', async ($, on) => {
  setup($, on)
  expect(($ && (await $.command.run({ command: 'conan-mods', args: 'rm-guard off' }))).text).toBe('rm-guard: off')
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf ~' })).text).toBe('ran')
  const band = await $.ui.mount({ plugin: 'conan-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  expect(await band.find({ type: 'Text', text: '⚠ off: rm-guard' })).toBeDefined()
  await band.unmount()
  expect((await $.command.run({ command: 'conan-mods', args: 'rm-guard on' })).text).toBe('rm-guard: on')
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf ~' })).deny).toContain('BLOCKED')
})
