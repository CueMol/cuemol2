/**
 * @file worker/server/catalog/consoleFormat.ts
 * @description Helpers for an op's `format`: laying a result out as lines a
 * person reads at a console prompt.
 */

/** Transcript width a wrapped list fills. */
export const CONSOLE_WIDTH = 76

/** Words joined with `sep`, wrapped to the transcript width. */
export function wrapList(items: readonly string[], indent: string, sep = ', '): string[] {
  const out: string[] = []
  const tail = sep.trimEnd()
  let line = ''
  for (const item of items) {
    const next = line === '' ? item : `${line}${sep}${item}`
    if (line !== '' && indent.length + next.length > CONSOLE_WIDTH) {
      out.push(`${indent}${line}${tail}`)
      line = item
    } else {
      line = next
    }
  }
  if (line !== '') out.push(`${indent}${line}`)
  return out
}

/** Rows of cells, each column padded to its widest cell. */
export function columns(rows: readonly (readonly string[])[], indent = ''): string[] {
  const widths: number[] = []
  for (const row of rows) row.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, c.length) })
  return rows.map((row) =>
    `${indent}${row.map((c, i) => (i === row.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd(),
  )
}
