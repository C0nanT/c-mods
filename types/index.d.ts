/** Whether each plugin function is on; a name never written counts as on. */
export type StoredToggles = {
  caveman?: boolean
  'git-guard'?: boolean
  'dotenv-guard'?: boolean
  'secret-guard'?: boolean
  'rm-guard'?: boolean
  sound?: boolean
  'session-log'?: boolean
  statusline?: boolean
  'statusline-color'?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'c-mods': { toggles: StoredToggles }
  }
}
