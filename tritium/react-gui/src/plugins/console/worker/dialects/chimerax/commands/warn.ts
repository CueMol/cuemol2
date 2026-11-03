/**
 * @file plugins/console/worker/dialects/chimerax/commands/warn.ts
 * @description Saying a keyword was accepted but not acted on.
 */

import type { CmdContext } from '../../../runtime/types'

/**
 * Warn about each of `names` that was given: the keyword is read so a
 * ChimeraX script runs on, but the console does not do it yet.
 */
export function warnIgnored(cc: CmdContext, command: string, args: Record<string, string>, names: readonly string[]): void {
  for (const n of names) if ((args[n] ?? '') !== '') cc.warn(`${command}: ${n} is not supported yet; ignored`)
}
