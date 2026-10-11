/**
 * @file completion.ts
 * @description Tab's candidates and the menu that walks them, as zsh shows
 * them, for the console panel and tritium_cli alike.
 *
 * The app's worker finds the candidates (react-gui
 * plugins/console/worker/completion/complete.ts); each one carries the whole
 * text before the caret it stands for, so a client never rebuilds a line.
 * This module lays them out and moves the selection; drawing and keys stay
 * with each client.
 *
 * The behaviour is zsh's auto_list + auto_menu + menu select: the first Tab
 * on several candidates lists them (and extends to what they share), the
 * second Tab starts the menu on the first one, and from there Tab /
 * Shift-Tab and the arrows move. Enter accepts, Esc puts back what was
 * typed, and any other key accepts and goes on as typed.
 */

/** What a candidate is, for its colour. */
export type CandidateKind = 'dir' | 'file' | 'exec' | 'link' | 'command' | 'value' | 'argument' | 'variable'

/** One candidate. */
export interface CompletionCandidate {
  /** As listed: a file's name (a directory with its slash), a value, a command. */
  label: string
  /** The whole text before the caret when this one is chosen, separator included. */
  replacement: string
  kind: CandidateKind
  /** The kind of thing it is ("files", "color"); a heading when there are several. */
  group: string
}

/** The longest string every one of `items` starts with. */
export function commonPrefix(items: readonly string[]): string {
  if (items.length === 0) return ''
  let prefix = items[0]
  for (const item of items) {
    let i = 0
    while (i < prefix.length && i < item.length && prefix[i] === item[i]) i += 1
    prefix = prefix.slice(0, i)
    if (prefix === '') break
  }
  return prefix
}

/** Whether a code point takes two cells (East Asian wide or fullwidth). */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

/** Cells `text` takes in a monospace font: wide characters two, combining marks none. */
export function displayWidth(text: string): number {
  let n = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0x300 && cp <= 0x36f) continue
    n += isWide(cp) ? 2 : 1
  }
  return n
}

/** Spaces between columns. */
export const GRID_GAP = 2

/** One group's candidates laid out: candidates[start, start + count) in `rows` x `columns`. */
export interface GridSection {
  group: string
  start: number
  count: number
  rows: number
  columns: number
  /** Cells per column, the gap not included. */
  cellWidth: number
}

/**
 * Lay the candidates out in `width` cells, one section per group, in the
 * order the groups first appear. Column-major, as PyMOL and zsh list: item
 * i of a section is at row `i % rows`, column `floor(i / rows)`.
 */
export function layoutSections(candidates: readonly CompletionCandidate[], width: number): GridSection[] {
  const sections: GridSection[] = []
  candidates.forEach((c, i) => {
    const last = sections[sections.length - 1]
    if (last && last.group === c.group) last.count += 1
    else sections.push({ group: c.group, start: i, count: 1, rows: 1, columns: 1, cellWidth: 1 })
  })
  for (const s of sections) {
    const labels = candidates.slice(s.start, s.start + s.count).map((c) => c.label)
    s.cellWidth = Math.max(1, ...labels.map(displayWidth))
    s.columns = Math.max(1, Math.min(s.count, Math.floor((width + GRID_GAP) / (s.cellWidth + GRID_GAP))))
    s.rows = Math.ceil(s.count / s.columns)
    // Fewer columns can hold the same rows; drop the empty ones.
    s.columns = Math.ceil(s.count / s.rows)
  }
  return sections
}

/** The candidate indices of a section, row by row; a short last column leaves a row shorter. */
export function sectionRows(s: GridSection): number[][] {
  const rows: number[][] = Array.from({ length: s.rows }, () => [])
  for (let i = 0; i < s.count; i++) rows[i % s.rows].push(s.start + i)
  return rows
}

/** A list on show, and the menu over it once started. */
export interface CompletionMenu {
  candidates: CompletionCandidate[]
  /** The text before the caret as it was when listed; Esc puts it back. */
  original: string
  /** The selected candidate; -1 while only listed. */
  selected: number
}

export type MenuMove = 'next' | 'prev' | 'up' | 'down' | 'left' | 'right'

/**
 * The menu after one move. The first move of a listed menu selects the first
 * candidate (the last for `prev`). Up and down step through a column and on
 * into the next, like Tab; left and right step a column within the section,
 * wrapping on the same row.
 */
export function moveMenu(menu: CompletionMenu, move: MenuMove, sections: readonly GridSection[]): CompletionMenu {
  const n = menu.candidates.length
  if (n === 0) return menu
  const i = menu.selected
  if (i < 0) return { ...menu, selected: move === 'prev' || move === 'up' ? n - 1 : 0 }
  let j = i
  if (move === 'next' || move === 'down') j = (i + 1) % n
  else if (move === 'prev' || move === 'up') j = (i - 1 + n) % n
  else {
    const s = sections.find((x) => i >= x.start && i < x.start + x.count)
    if (!s) return menu
    const row = (i - s.start) % s.rows
    const col = Math.floor((i - s.start) / s.rows)
    // The columns this row has: the last may be short.
    const cols = Math.floor((s.count - 1 - row) / s.rows) + 1
    const next = move === 'right' ? (col + 1) % cols : (col - 1 + cols) % cols
    j = s.start + next * s.rows + row
  }
  return { ...menu, selected: j }
}

/** The text before the caret the menu stands for: the selection's, or what was typed. */
export function menuText(menu: CompletionMenu): string {
  return menu.selected < 0 ? menu.original : menu.candidates[menu.selected].replacement
}
