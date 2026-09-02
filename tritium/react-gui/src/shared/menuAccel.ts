/**
 * @file shared/menuAccel.ts
 * @description Read Electron accelerator strings: render one as display text,
 * or parse one so a keyboard event can be matched against it.
 *
 * Electron accelerators are written platform-neutrally ('CmdOrCtrl+Shift+O').
 * On macOS the native menu resolves and owns them; on Windows / Linux the
 * renderer does (see renderer/shell/keybindings/useMenuKeyBindings.ts), so it
 * needs the same string as a modifier set + key. Any UI that prints a shortcut
 * itself -- the Windows/Linux menu bar, the empty-state start screen -- has to
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
 * @returns display text: the Shift+Command glyph pair followed by the key on
 *          macOS (U+21E7 U+2318 'O'), or `'Ctrl+Shift+O'` elsewhere
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

/** An accelerator resolved for one platform: which modifiers, and which key. */
export interface ParsedAccelerator {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** Lowercased key, in `KeyboardEvent.key` terms ('v', ',', 'f11'). */
  key: string
}

/** Tokens that always mean the Control key. */
const CTRL = new Set(['ctrl', 'control'])
const SHIFT = new Set(['shift'])
const ALT = new Set(['alt', 'option'])

/**
 * Resolve an Electron accelerator to the modifier set + key it stands for on
 * one platform. `CmdOrCtrl` is the Command key on macOS and Control elsewhere;
 * the bare Cmd / Super / Meta tokens mean the OS key (Meta) on every platform,
 * which is what `KeyboardEvent.metaKey` reports.
 *
 * @param acc - accelerator string, e.g. `'CmdOrCtrl+Shift+O'`
 * @param isMac - true on darwin
 */
export function parseAccelerator(acc: string, isMac: boolean): ParsedAccelerator {
  const tokens = acc.split('+')
  const key = tokens[tokens.length - 1].toLowerCase()
  const parsed: ParsedAccelerator = { ctrl: false, shift: false, alt: false, meta: false, key }
  for (const raw of tokens.slice(0, -1)) {
    const m = raw.toLowerCase()
    if (m === 'cmdorctrl' || m === 'commandorcontrol') {
      if (isMac) parsed.meta = true
      else parsed.ctrl = true
    } else if (CTRL.has(m)) {
      parsed.ctrl = true
    } else if (SHIFT.has(m)) {
      parsed.shift = true
    } else if (ALT.has(m)) {
      parsed.alt = true
    } else if (CMD_OR_CTRL.has(m)) {
      parsed.meta = true
    }
  }
  return parsed
}

/** The subset of `KeyboardEvent` an accelerator match reads. */
export interface AcceleratorKeyEvent {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  key: string
}

/**
 * Whether a keyboard event is exactly this accelerator: every modifier state
 * must agree (so `Ctrl+Shift+V` does not satisfy `Ctrl+V`) and the key must
 * match case-insensitively (Shift changes `e.key` to the upper-case letter).
 */
export function acceleratorMatchesKey(acc: ParsedAccelerator, e: AcceleratorKeyEvent): boolean {
  return (
    e.ctrlKey === acc.ctrl &&
    e.shiftKey === acc.shift &&
    e.altKey === acc.alt &&
    e.metaKey === acc.meta &&
    e.key.toLowerCase() === acc.key
  )
}
