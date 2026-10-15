import { expect, mock, test } from 'claude-code/testing'

const FACTS = { model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }
const SKILL = 'CAVEMAN SKILL TEXT'
const WARNING = 'caveman: skill não encontrada, rode `npx skills@latest add C0nanT/c-skills`'

function world($: any, on: any, skill: string | Error, stored: Record<string, unknown> = {}) {
  mock.store(on, stored)
  mock.env(on, { HOME: '/home/test' })
  const toasts: string[] = []
  const paths: string[] = []
  on('fs.read', (_$: any, e: any) => {
    paths.push(e.path)
    if (skill instanceof Error) return { deny: skill.message }
    return { value: skill }
  })
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text ?? e)
    return { value: undefined }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
  return { toasts, paths }
}

const ids = async ($: any) => (await $.prompt.compose(FACTS)).sections.map((s: any) => s.id)

test('with the skill present and on, the section holds the skill text', async ($, on) => {
  const w = world($, on, SKILL)
  const { sections } = await $.prompt.compose(FACTS)
  expect(sections.find((s: any) => s.id === 'c-mods:caveman').text).toBe(SKILL)
  expect(w.paths).toEqual(['/home/test/.claude/skills/caveman/SKILL.md'])
  expect(w.toasts).toEqual([])
})

test('off drops the section, on brings it back on the next composition', async ($, on) => {
  world($, on, SKILL)
  await $.command.run({ command: 'c-mods', args: 'caveman off' })
  expect(await ids($)).toEqual(['base'])
  await $.command.run({ command: 'c-mods', args: 'caveman on' })
  expect(await ids($)).toEqual(['base', 'c-mods:caveman'])
})

test('without the skill the section is absent and the warning shows once', async ($, on) => {
  const w = world($, on, new Error('ENOENT'))
  expect(await ids($)).toEqual(['base'])
  expect(await ids($)).toEqual(['base'])
  expect(await ids($)).toEqual(['base'])
  expect(w.toasts).toEqual([WARNING])
})

test('off without the skill does not warn', async ($, on) => {
  const w = world($, on, new Error('ENOENT'), { caveman: false })
  expect(await ids($)).toEqual(['base'])
  expect(w.toasts).toEqual([])
})
