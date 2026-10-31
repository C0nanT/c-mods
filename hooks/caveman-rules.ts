/** The plugin that ships the caveman skill, as `installed_plugins.json` and `enabledPlugins` name it (`<plugin>@<marketplace>`). */
const SKILLS_PLUGIN = 'c-skills'

/** Where the skill sits inside an install of the plugin. */
const PLUGIN_SKILL_PATH = 'skills/productivity/caveman/SKILL.md'

export const CAVEMAN_WARNING = 'caveman: skill não encontrada, instale o c-skills: `/plugin marketplace add C0nanT/c-skills` e `/plugin install c-skills@c-skills`'

type PluginInstall = { scope?: unknown; installPath?: unknown; projectPath?: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSkillsPlugin(key: string): boolean {
  return key.startsWith(`${SKILLS_PLUGIN}@`)
}

/** True when settings.json switches the plugin off; a missing or unreadable setting leaves it on. */
function isPluginDisabled(settings: unknown): boolean {
  const enabled = isRecord(settings) ? settings.enabledPlugins : undefined
  return isRecord(enabled) && Object.entries(enabled).some(([key, value]) => isSkillsPlugin(key) && value === false)
}

function isInside(cwd: string, dir: string): boolean {
  return cwd === dir || cwd.startsWith(`${dir.replace(/\/+$/, '')}/`)
}

/** The skills.sh copy of the skill, tried before any plugin install. */
export function skillsShSkillPath(home: string): string {
  return `${home}/.claude/skills/caveman/SKILL.md`
}

/**
 * The caveman SKILL.md of each install of the c-skills plugin, in the order to try: an install for
 * the session's project before a user-wide one. A disabled plugin, or a registry that is missing or
 * not the expected JSON, gives none.
 */
export function pluginSkillPaths(cwd: string, registry: string | undefined, settings: unknown): string[] {
  if (registry === undefined || isPluginDisabled(settings)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(registry)
  } catch {
    return []
  }
  const plugins = isRecord(parsed) ? parsed.plugins : undefined
  if (!isRecord(plugins)) return []
  const installs = Object.entries(plugins)
    .filter(([key, value]) => isSkillsPlugin(key) && Array.isArray(value))
    .flatMap(([, value]) => (value as unknown[]).filter(isRecord) as PluginInstall[])
  const forProject = installs.filter(i => typeof i.projectPath === 'string' && i.projectPath !== '' && isInside(cwd, i.projectPath))
  const userWide = installs.filter(i => i.scope === 'user')
  const paths: string[] = []
  for (const install of [...forProject, ...userWide]) {
    if (typeof install.installPath !== 'string' || install.installPath === '') continue
    const path = `${install.installPath.replace(/\/+$/, '')}/${PLUGIN_SKILL_PATH}`
    if (!paths.includes(path)) paths.push(path)
  }
  return paths
}
