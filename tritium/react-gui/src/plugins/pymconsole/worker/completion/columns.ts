/**
 * @file plugins/pymconsole/worker/completion/columns.ts
 * @description Laying a candidate list out in columns.
 *
 * A port of `parsing.list_to_str_list` (`modules/pymol/parsing.py`), because
 * a list of colour names printed one per line is a wall nobody reads, and
 * because matching PyMOL's shape is what makes the console feel like the one
 * people already know.
 *
 * The detail that is easy to get wrong: the fill is **column-major**. Item i
 * goes to row `i % rowCount`, so the list reads down each column, not across
 * each row. Reversing that sorts the output wrongly while looking fine.
 */

/** Terminal width PyMOL assumes. */
const WIDTH = 77

/** Indent in front of every line. */
const MARGIN = 2

/** Spaces between columns. */
const GAP = 2

/**
 * `items` as printable lines.
 *
 * @returns one string per row; empty when there is nothing to show.
 */
export function formatColumns(items: readonly string[]): string[] {
  if (items.length === 0) return []

  const cellWidth = Math.max(1, ...items.map((s) => s.length))
  const available = WIDTH - MARGIN
  let columns = Math.floor(WIDTH / cellWidth)
  while (columns * cellWidth + GAP * columns > available) columns -= 1
  if (columns < 1) columns = 1

  const rowCount = Math.ceil(items.length / columns)
  const rows: string[][] = Array.from({ length: rowCount }, () => [])
  items.forEach((item, i) => {
    // Column-major: down one column, then on to the next.
    rows[i % rowCount].push(item.padEnd(cellWidth))
  })

  return rows.map((cells) => ' '.repeat(MARGIN) + cells.join(' '.repeat(GAP)))
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
