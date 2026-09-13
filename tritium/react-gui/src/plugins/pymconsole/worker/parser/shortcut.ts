/**
 * @file plugins/pymconsole/worker/parser/shortcut.ts
 * @description Resolving an abbreviation against a list of names.
 *
 * A port of `Shortcut.interpret` (`modules/pymol/shortcut.py`). PyMOL lets a
 * name be shortened two ways, and both are worth having because people who
 * use PyMOL have them in their fingers:
 *
 * - a unique prefix (`sho` -> `show`)
 * - an underscore abbreviation, leading parts cut to their first letters
 *   (`s_n` -> `set_name`, `b_c` -> `bg_color`)
 *
 * The same routine answers two different questions, which is why it takes a
 * mode. Running a command wants the shortest answer: an exact name is that
 * name, full stop. Completing wants to know what else starts the same way,
 * so an exact name still reports its longer siblings -- which is why `set`
 * followed by Tab lists `set_name` rather than completing to `set`.
 */

/** What a lookup found. */
export type ShortcutResult =
  | { kind: 'found'; name: string }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: string[] }

export interface ShortcutOptions {
  /**
   * Keep searching for longer names even when `word` is one exactly.
   *
   * PyMOL's `mode` argument. False when resolving a command to run, true when
   * completing.
   */
  prefixSearchOnExact?: boolean
}

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
  const longest = Math.max(...parts.slice(0, -1).map((p) => p.length))
  for (let len = 1; len <= longest; len += 1) {
    const abbr = [...parts.slice(0, -1).map((p) => p.slice(0, len)), parts[parts.length - 1]].join(
      '_',
    )
    if (!out.includes(abbr)) out.push(abbr)
  }
  return out
}

/**
 * The name `word` stands for.
 *
 * @param word - what the user typed. Empty means "everything", which is how
 *   Tab on a bare prompt lists the whole catalogue.
 * @param names - every candidate, in any order.
 */
export function interpretShortcut(
  word: string,
  names: readonly string[],
  options: ShortcutOptions = {},
): ShortcutResult {
  if (word === '') {
    if (names.length === 0) return { kind: 'none' }
    if (names.length === 1) return { kind: 'found', name: names[0] }
    return { kind: 'ambiguous', candidates: [...names].sort() }
  }

  if (!options.prefixSearchOnExact && names.includes(word)) {
    return { kind: 'found', name: word }
  }

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
