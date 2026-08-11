/**
 * @file shared/menuAccel.ts
 * @description Render an Electron accelerator string as display text.
 *
 * Electron accelerators are written platform-neutrally ('CmdOrCtrl+Shift+O')
 * and resolved by the OS for the native menu, but any UI that prints a
 * shortcut itself -- the Windows/Linux menu bar, the welcome screen -- has to
 * spell it out. macOS uses the modifier glyphs in their canonical order and no
 * separators; everywhere else the words joined by '+'.
 */

/** macOS modifier glyphs, keyed by the lowercased accelerator token. */
const MAC_GLYPHS: Record<string, string> = {
  cmdorctrl: '⌘',
  commandorcontrol: '⌘',
  cmd: '⌘',
  command: '⌘',
  super: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
}

/** Canonical macOS modifier order, innermost (key-adjacent) glyph last. */
const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘']

/** Tokens that mean "the Cmd/Ctrl key" and print as Ctrl off macOS. */
const CMD_OR_CTRL = new Set(['cmdorctrl', 'commandorcontrol', 'cmd', 'command', 'super', 'meta'])

/**
 * Convert an Electron accelerator to the text shown to the user.
 *
 * @param acc - accelerator string, e.g. `'CmdOrCtrl+Shift+O'`
 * @param isMac - true on darwin; selects glyphs over words
 * @returns display text, e.g. `'⇧⌘O'` on macOS, `'Ctrl+Shift+O'` elsewhere
 */
export function formatAccelerator(acc: string, isMac: boolean): string {
  const tokens = acc.split('+')
  const key = tokens[tokens.length - 1]
  const mods = tokens.slice(0, -1)

  if (!isMac) {
    return [...mods.map((m) => (CMD_OR_CTRL.has(m.toLowerCase()) ? 'Ctrl' : m)), key].join('+')
  }

  const glyphs = mods.map((m) => MAC_GLYPHS[m.toLowerCase()] ?? m)
  // Sort into the order macOS itself prints; unknown tokens keep their place
  // at the front rather than being dropped.
  const known = glyphs.filter((g) => MAC_ORDER.includes(g))
  const unknown = glyphs.filter((g) => !MAC_ORDER.includes(g))
  known.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b))
  return [...unknown, ...known].join('') + key
}
