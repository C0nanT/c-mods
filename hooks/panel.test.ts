import { expect, mock, test } from 'claude-code/testing'

const NAMES = ['caveman', 'git-guard', 'dotenv-guard', 'secret-guard', 'rm-guard', 'sound', 'statusline', 'statusline-color']
const DEFAULT = 'engine default'

for (const surface of ['terminal', 'vscode'] as const) {
  test(`${surface}: the pane lists every function and a button switches git-guard off and on`, async ($, on) => {
    mock.store(on)
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran', text: 'ran' }))
    const out = await $.command.run({ command: 'c-mods', args: '' })
    for (const name of NAMES) expect(out.text).toContain(`${name}: on`)

    const pane = await $.ui.mount({ plugin: 'c-mods', surface, component: 'Pane', requestId: 'c-mods', props: {} })
    const band = await $.ui.mount({ plugin: 'c-mods', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
    for (const name of NAMES) expect(await pane.find({ type: 'Text', text: `${name}: on ` })).toBeDefined()

    await pane.press({ key: 'git-guard' })
    expect(await pane.find({ type: 'Text', text: 'git-guard: off ' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '⚠ off: git-guard' })).toBeDefined()
    expect((await $.tool.call({ tool: 'Bash', command: 'git push origin main' })).text).toBe('ran')

    await pane.press({ key: 'git-guard' })
    expect(await pane.find({ type: 'Text', text: 'git-guard: on ' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /off:/ })).toBeUndefined()
    expect((await $.tool.call({ tool: 'Bash', command: 'git push origin main' })).deny).toContain('BLOCKED')
    await pane.unmount()
    await band.unmount()
  })
}

function openScenario(on: any, answer: (e: any) => unknown) {
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text ?? e)
    return { value: undefined } as never
  })
  on('ui.open', ((_$: any, e: any) => answer(e)) as never)
  return toasts
}

test('/c-mods opens the focused pane and keeps the text list', async ($, on) => {
  const opens: unknown[] = []
  const toasts = openScenario(on, e => {
    opens.push(e)
    return { value: { isPlaced: true } }
  })
  const out = await $.command.run({ command: 'c-mods', args: '' })
  expect(opens).toEqual([{ id: 'c-mods', title: 'c-mods', focus: true, closeOnEscape: true }])
  expect(toasts).toEqual([])
  for (const name of NAMES) expect(out.text).toContain(`${name}: on`)
})

test('/c-mods toasts why when the engine defers the pane', async ($, on) => {
  const toasts = openScenario(on, () => ({ value: { isPlaced: false, reason: 'terminal is 100 columns, needs 144' } }))
  const out = await $.command.run({ command: 'c-mods', args: '' })
  expect(toasts.join('\n')).toContain('terminal is 100 columns, needs 144')
  for (const name of NAMES) expect(out.text).toContain(`${name}: on`)
})

test('/c-mods toasts why when opening the pane fails', async ($, on) => {
  const toasts = openScenario(on, () => ({ deny: 'pane refused' }))
  const out = await $.command.run({ command: 'c-mods', args: '' })
  expect(toasts.join('\n')).toContain('pane refused')
  for (const name of NAMES) expect(out.text).toContain(`${name}: on`)
})
