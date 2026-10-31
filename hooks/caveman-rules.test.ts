import { expect, test } from 'claude-code/testing'
import { pluginSkillPaths, skillsShSkillPath } from './caveman-rules'

const SKILL = 'skills/productivity/caveman/SKILL.md'
const registry = (plugins: unknown) => JSON.stringify({ version: 2, plugins })
const user = { scope: 'user', installPath: '/c/user/1.0.0' }
const project = { scope: 'project', projectPath: '/work/app', installPath: '/c/project/2.0.0' }

test('skills.sh path: under the home skills folder', () => {
  expect(skillsShSkillPath('/home/test')).toBe('/home/test/.claude/skills/caveman/SKILL.md')
})

test('plugin paths: a user install gives its skill path', () => {
  expect(pluginSkillPaths('/work/app', registry({ 'c-skills@c-skills': [user] }), undefined)).toEqual([`/c/user/1.0.0/${SKILL}`])
})

test('plugin paths: an install for the session project comes before the user one', () => {
  expect(pluginSkillPaths('/work/app/sub', registry({ 'c-skills@c-skills': [user, project] }), undefined)).toEqual([`/c/project/2.0.0/${SKILL}`, `/c/user/1.0.0/${SKILL}`])
})

test('plugin paths: an install for another project is skipped', () => {
  expect(pluginSkillPaths('/work/application', registry({ 'c-skills@c-skills': [project] }), undefined)).toEqual([])
})

test('plugin paths: any marketplace name for c-skills counts, other plugins do not', () => {
  const plugins = { 'c-skills@other-market': [user], 'c-mods@c-mods': [{ scope: 'user', installPath: '/c/mods' }] }
  expect(pluginSkillPaths('/work/app', registry(plugins), undefined)).toEqual([`/c/user/1.0.0/${SKILL}`])
})

test('plugin paths: a disabled plugin gives none; enabled or unset keeps them', () => {
  const text = registry({ 'c-skills@c-skills': [user] })
  expect(pluginSkillPaths('/work/app', text, { enabledPlugins: { 'c-skills@c-skills': false } })).toEqual([])
  expect(pluginSkillPaths('/work/app', text, { enabledPlugins: { 'c-skills@c-skills': true } })).toHaveLength(1)
  expect(pluginSkillPaths('/work/app', text, { enabledPlugins: 'nope' })).toHaveLength(1)
})

test('plugin paths: a missing, invalid or unexpected registry gives none', () => {
  for (const text of [undefined, '', '{nope', 'null', '[]', registry('x'), registry({ 'c-skills@c-skills': 'x' }), registry({ 'c-skills@c-skills': [{ scope: 'user' }, 7] })]) {
    expect(pluginSkillPaths('/work/app', text, undefined)).toEqual([])
  }
})

test('plugin paths: a trailing slash on installPath is dropped, duplicates are not repeated', () => {
  const plugins = { 'c-skills@c-skills': [{ scope: 'user', installPath: '/c/user/1.0.0/' }, user] }
  expect(pluginSkillPaths('/work/app', registry(plugins), undefined)).toEqual([`/c/user/1.0.0/${SKILL}`])
})
