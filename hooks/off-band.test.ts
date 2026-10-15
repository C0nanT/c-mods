import { expect, mock, test } from 'claude-code/testing'

const DEFAULT = 'engine default'

async function band($: any) {
  const ui = await $.ui.mount({ plugin: 'c-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  return ui
}

test('with everything on, the band draws nothing', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: /off:/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: DEFAULT })).toBeDefined()
  await ui.unmount()
})

test('with git-guard and sound off, the band lists them in fixed order', async ($, on) => {
  mock.store(on, { sound: false, 'git-guard': false })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: '⚠ off: git-guard · sound' })).toBeDefined()
  await ui.unmount()
})

test('the next draw after /c-mods reflects the change', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  await $.command.run({ command: 'c-mods', args: 'caveman off' })
  let ui = await band($)
  expect(await ui.find({ type: 'Text', text: '⚠ off: caveman' })).toBeDefined()
  await ui.unmount()
  await $.command.run({ command: 'c-mods', args: 'caveman on' })
  ui = await band($)
  expect(await ui.find({ type: 'Text', text: /off:/ })).toBeUndefined()
  await ui.unmount()
})

test('statusline off is listed last in the band', async ($, on) => {
  mock.store(on, { sound: false, statusline: false })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [DEFAULT] }))
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: '⚠ off: sound · statusline' })).toBeDefined()
  await ui.unmount()
})
