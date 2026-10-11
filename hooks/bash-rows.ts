import { expect, test } from 'claude-code/testing'

/** Marks a table row whose command the guard lets run. */
export const PASS = null
/** One row per Bash command: [command, expected]. expected is what the guard's deny message holds, or PASS. */
export type Row = [command: string, expected: string | typeof PASS]

/** Registers one test per row: PASS rows must run, the others must deny in the way `expectDeny` checks. */
export function bashRowTests(
  rows: Row[],
  setup: ($: any, on: any) => void | Promise<void>,
  expectDeny: (deny: string | undefined, expected: string) => void,
) {
  for (const [command, expected] of rows) {
    test(`${expected === PASS ? 'passes' : 'denies'} bash: ${JSON.stringify(command)}`, async ($, on) => {
      await setup($, on)
      const out = await $.tool.call({ tool: 'Bash', command })
      if (expected === PASS) expect(out.text).toBe('ran')
      else expectDeny(out.deny, expected)
    })
  }
}
