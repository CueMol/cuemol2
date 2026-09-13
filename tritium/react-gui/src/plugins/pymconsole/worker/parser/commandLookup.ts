/**
 * @file plugins/pymconsole/worker/parser/commandLookup.ts
 * @description Finding the command a typed word means.
 *
 * A port of `Shortcut.interpret` (`modules/pymol/shortcut.py`). PyMOL lets a
 * command be abbreviated two ways, and both are worth having because people
 * who use PyMOL have them in their fingers:
 *
 * - a unique prefix (`sho` -> `show`)
 * - an underscore abbreviation, first letters of each part but the last
 *   (`s_n` -> `set_name`, `b_c` -> `bg_color`)
 *
 * An exact name always wins, so adding a command can never change what an
 * existing full name means.
 */

/** What a lookup found. */
export type LookupResult =
  | { kind: 'found'; name: string }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: string[] }

/**
 * Underscore abbreviations of `name`, shortest part-prefix first.
 *
 * `set_name` yields `s_name`; `a_b_cee` yields `a_b_cee` shortened at each
 * leading part. The last part is never shortened, matching PyMOL.
 */
function abbreviations(name: string): string[] {
  const parts = name.split('_')
  if (parts.length < 2) return []
  const out: string[] = []
  for (let len = 1; len < Math.max(...parts.slice(0, -1).map((p) => p.length)) + 1; len += 1) {
    const abbr = [...parts.slice(0, -1).map((p) => p.slice(0, len)), parts[parts.length - 1]].join(
      '_',
    )
    if (!out.includes(abbr)) out.push(abbr)
  }
  return out
}

/**
 * The command `word` names.
 *
 * @param word - what the user typed.
 * @param names - every command name, in any order.
 */
export function lookupCommand(word: string, names: readonly string[]): LookupResult {
  if (names.includes(word)) return { kind: 'found', name: word }

  const hits = new Set<string>()
  for (const name of names) {
    if (name.startsWith(word)) hits.add(name)
  }
  for (const name of names) {
    if (abbreviations(name).some((a) => a.startsWith(word))) hits.add(name)
  }

  if (hits.size === 0) return { kind: 'none' }
  if (hits.size === 1) return { kind: 'found', name: [...hits][0] }
  return { kind: 'ambiguous', candidates: [...hits].sort() }
}
