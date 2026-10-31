import { expect, mock, test } from 'claude-code/testing'

const FACTS = { model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }
const SKILL = 'CAVEMAN SKILL TEXT'
const WARNING = 'caveman: skill não encontrada, instale o c-skills: `/plugin marketplace add C0nanT/c-skills` e `/plugin install c-skills@c-skills`'
const SKILLS_SH = '/home/test/.claude/skills/caveman/SKILL.md'
const REGISTRY = '/home/test/.claude/plugins/installed_plugins.json'
const SETTINGS = '/home/test/.claude/settings.json'
const INSTALL = '/home/test/.claude/plugins/cache/c-skills/c-skills/1.2.0'
const PLUGIN_SKILL = `${INSTALL}/skills/productivity/caveman/SKILL.md`
const REGISTRY_TEXT = JSON.stringify({ version: 2, plugins: { 'c-skills@c-skills': [{ scope: 'user', installPath: INSTALL, version: '1.2.0' }] } })

/** `skill` alone is the skills.sh copy (an Error: missing); `files` adds any other path, the plugin's included. */
function world($: any, on: any, skill: string | Error, stored: Record<string, unknown> = {}, files: Record<string, string> = {}) {
  mock.store(on, stored)
  mock.env(on, { HOME: '/home/test' })
  const toasts: string[] = []
  const paths: string[] = []
  const all = files
  if (!(skill instanceof Error)) all[SKILLS_SH] = skill
  on('session.cwd', () => ({ value: '/work/app' }))
  on('fs.read', (_$: any, e: any) => {
    paths.push(e.path)
    return e.path in all ? { value: all[e.path] } : { deny: skill instanceof Error ? skill.message : 'ENOENT' }
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

const sectionText = async ($: any) => (await $.prompt.compose(FACTS)).sections.find((s: any) => s.id === 'c-mods:caveman')?.text

test('with only the plugin installed, the section holds the plugin copy of the skill', async ($, on) => {
  const w = world($, on, new Error('ENOENT'), {}, { [REGISTRY]: REGISTRY_TEXT, [PLUGIN_SKILL]: 'PLUGIN SKILL' })
  expect(await sectionText($)).toBe('PLUGIN SKILL')
  expect(w.paths).toContain(PLUGIN_SKILL)
  expect(w.toasts).toEqual([])
})

test('with both installs, the skills.sh copy wins and the plugin registry is not read', async ($, on) => {
  const w = world($, on, SKILL, {}, { [REGISTRY]: REGISTRY_TEXT, [PLUGIN_SKILL]: 'PLUGIN SKILL' })
  expect(await sectionText($)).toBe(SKILL)
  expect(w.paths).toEqual([SKILLS_SH])
})

test('a plugin update is followed at the next composition, with no change here', async ($, on) => {
  const next = '/home/test/.claude/plugins/cache/c-skills/c-skills/1.3.0'
  const files: Record<string, string> = { [REGISTRY]: REGISTRY_TEXT, [PLUGIN_SKILL]: 'OLD', [`${next}/skills/productivity/caveman/SKILL.md`]: 'NEW' }
  world($, on, new Error('ENOENT'), {}, files)
  expect(await sectionText($)).toBe('OLD')
  files[REGISTRY] = REGISTRY_TEXT.replaceAll('1.2.0', '1.3.0')
  expect(await sectionText($)).toBe('NEW')
})

test('a disabled plugin counts as absent and warns', async ($, on) => {
  const settings = JSON.stringify({ enabledPlugins: { 'c-skills@c-skills': false } })
  const w = world($, on, new Error('ENOENT'), {}, { [REGISTRY]: REGISTRY_TEXT, [PLUGIN_SKILL]: 'PLUGIN SKILL', [SETTINGS]: settings })
  expect(await ids($)).toEqual(['base'])
  expect(w.toasts).toEqual([WARNING])
})

for (const [label, registry] of [['invalid', '{not json'], ['without c-skills', JSON.stringify({ plugins: { 'c-mods@c-mods': [] } })]] as const) {
  test(`a registry ${label} falls back to the warning`, async ($, on) => {
    const w = world($, on, new Error('ENOENT'), {}, { [REGISTRY]: registry })
    expect(await ids($)).toEqual(['base'])
    expect(w.toasts).toEqual([WARNING])
  })
}

test('an empty plugin copy counts as missing', async ($, on) => {
  const w = world($, on, new Error('ENOENT'), {}, { [REGISTRY]: REGISTRY_TEXT, [PLUGIN_SKILL]: '  \n' })
  expect(await ids($)).toEqual(['base'])
  expect(w.toasts).toEqual([WARNING])
})
