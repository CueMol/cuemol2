/**
 * @file plugins/pymconsole/worker/parser/commandLookup.ts
 * @description Finding the command a typed word means.
 *
 * Running a command resolves its name with `prefixSearchOnExact` off: a word
 * that is a command exactly is that command, even when longer names start
 * the same way. `set` runs `set`, rather than reporting that `set_name`
 * exists. Completion asks the same question the other way round; see
 * `shortcut.ts`.
 */

import { interpretShortcut } from './shortcut'
import type { ShortcutResult } from './shortcut'

/** What a lookup found. */
export type LookupResult = ShortcutResult

/**
 * The command `word` names.
 *
 * @param word - what the user typed.
 * @param names - every command name, in any order.
 */
export function lookupCommand(word: string, names: readonly string[]): LookupResult {
  return interpretShortcut(word, names)
}
