/**
 * @file markdownAnsi.ts
 * @description Markdown output (help) drawn for a terminal.
 *
 * Reads the text with @cuemol/console-kit `parseMarkdown`, the same reading
 * the panel draws as React, and lays it out in the terminal's width:
 * paragraphs and list items wrapped, tables fitted by wrapping their widest
 * columns, code left as written. Headings, table heads and strong text are
 * bold, code lavender. Colour goes when `colour` is false
 * (NO_COLOR); the layout stays.
 */

import { displayWidth, inlineText, parseMarkdown } from '@cuemol/console-kit'
import type { MdBlock, MdInline } from '@cuemol/console-kit'

/** A run of text in one style (SGR parameters, '' for none). */
interface Seg {
  text: string
  style: string
  /** A code span: kept on one line, its spaces included. */
  whole?: boolean
}

const ACCENT = '38;5;147'
const CODE = ACCENT
// Bold in the terminal's own foreground: white on a dark theme, still legible on a light one.
const STRONG = '1'
// Kept as escapes so the source stays ASCII.
const BULLET = '\u2022'
const RULE = '\u2500'
const BAR = '\u2502'

function segsOf(parts: readonly MdInline[], style = ''): Seg[] {
  const join = (a: string, b: string) => (a && b ? `${a};${b}` : a || b)
  return parts.flatMap((p): Seg[] => {
    switch (p.type) {
      case 'text':
        return [{ text: p.text, style }]
      case 'code':
        return [{ text: p.text, style: join(style, CODE), whole: true }]
      case 'br':
        return [{ text: '\n', style }]
      case 'strong':
        return segsOf(p.children, join(style, STRONG))
      case 'em':
        return segsOf(p.children, join(style, '3'))
    }
  })
}

/** Segments broken into lines of at most `width` cells, at spaces; a longer word overflows. */
function wrap(segs: readonly Seg[], width: number): Seg[][] {
  const lines: Seg[][] = [[]]
  let used = 0
  let space = false
  for (const seg of segs) {
    for (const piece of seg.whole ? [seg.text] : seg.text.split(/(\s+)/)) {
      if (piece === '') continue
      if (!seg.whole && /^\s+$/.test(piece)) {
        if (piece.includes('\n') && seg.text === '\n') {
          lines.push([])
          used = 0
          space = false
        } else if (used > 0) {
          space = true
        }
        continue
      }
      const w = displayWidth(piece)
      if (used > 0 && used + (space ? 1 : 0) + w > width) {
        lines.push([])
        used = 0
        space = false
      }
      const line = lines[lines.length - 1]
      if (space) {
        line.push({ text: ' ', style: '' })
        used += 1
      }
      line.push({ text: piece, style: seg.style })
      used += w
      space = false
    }
  }
  return lines
}

function widthOf(line: readonly Seg[]): number {
  return line.reduce((n, s) => n + displayWidth(s.text), 0)
}

function paint(line: readonly Seg[], colour: boolean): string {
  return line.map((s) => (colour && s.style ? `\x1b[${s.style}m${s.text}\x1b[0m` : s.text)).join('')
}

/** Column widths that fit `width`: the widest columns give way first, down to a floor. */
function fitColumns(natural: number[], width: number, gap: number): number[] {
  const cols = [...natural]
  const floor = 8
  const total = () => cols.reduce((a, b) => a + b, 0) + gap * (cols.length - 1)
  while (total() > width) {
    const widest = cols.indexOf(Math.max(...cols))
    if (cols[widest] <= floor) break
    cols[widest] -= 1
  }
  return cols
}

function table(block: Extract<MdBlock, { type: 'table' }>, width: number, colour: boolean): string[] {
  const gap = 2
  const all = [block.header, ...block.rows]
  const natural = block.header.map((_, c) => Math.max(1, ...all.map((r) => displayWidth(inlineText(r[c] ?? [])))))
  const cols = fitColumns(natural, width, gap)
  const out: string[] = []
  const row = (cells: readonly MdInline[][], head: boolean) => {
    const wrapped = cols.map((w, c) => wrap(segsOf(cells[c] ?? [], head ? STRONG : ''), w))
    const height = Math.max(...wrapped.map((l) => l.length))
    for (let i = 0; i < height; i++) {
      const line = wrapped
        .map((lines, c) => {
          const l = lines[i] ?? []
          const pad = c === cols.length - 1 ? '' : ' '.repeat(cols[c] - widthOf(l) + gap)
          return paint(l, colour) + pad
        })
        .join('')
      out.push(line.trimEnd())
    }
  }
  row(block.header, true)
  out.push(cols.map((w) => RULE.repeat(w)).join(' '.repeat(gap)))
  for (const r of block.rows) row(r, false)
  return out
}

function render(blocks: readonly MdBlock[], width: number, colour: boolean): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (out.length > 0) out.push('')
    switch (b.type) {
      case 'heading':
        for (const l of wrap(segsOf(b.children, STRONG), width)) out.push(paint(l, colour))
        break
      case 'paragraph':
        for (const l of wrap(segsOf(b.children), width)) out.push(paint(l, colour))
        break
      case 'code':
        for (const l of b.text.split('\n')) out.push(paint([{ text: `    ${l}`, style: CODE }], colour))
        break
      case 'list':
        b.items.forEach((item, i) => {
          const mark = b.ordered ? `${b.start + i}. ` : `${BULLET} `
          const indent = displayWidth(mark)
          const body = render(item, Math.max(10, width - indent), colour).filter((l) => l !== '')
          body.forEach((l, k) => out.push((k === 0 ? mark : ' '.repeat(indent)) + l))
        })
        break
      case 'table':
        // Indented as far as a code block, so a table stands apart from the prose.
        out.push(...table(b, Math.max(10, width - 4), colour).map((l) => `    ${l}`))
        break
      case 'quote':
        for (const l of render(b.children, Math.max(10, width - 2), colour)) {
          out.push(`${colour ? `\x1b[${ACCENT}m${BAR}\x1b[0m` : BAR} ${l}`)
        }
        break
      case 'hr':
        out.push(RULE.repeat(Math.min(width, 40)))
        break
    }
  }
  return out
}

/** `text` (Markdown) as terminal lines in `width` cells. */
export function markdownToAnsi(text: string, width: number, colour: boolean): string[] {
  return render(parseMarkdown(text), width, colour)
}
