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
// A table's frame: rounded corners, and the joints where its rules meet.
const FRAME = { tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f', top: '\u252c', bottom: '\u2534', left: '\u251c', right: '\u2524', cross: '\u253c' }
// The frame is drawn dim, so the cells stand out against it.
const FRAME_STYLE = '38;5;240'

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

/**
 * Column widths that fit `width`: the widest columns give way first, each
 * down to its floor (8, or its longest word, so no word is cut).
 */
function fitColumns(natural: number[], width: number, gap: number, words: number[] = []): number[] {
  const cols = [...natural]
  const floor = cols.map((n, c) => Math.min(n, Math.max(8, words[c] ?? 0)))
  const total = () => cols.reduce((a, b) => a + b, 0) + gap * (cols.length - 1)
  while (total() > width) {
    const shrinkable = cols.map((w, c) => (w > floor[c] ? w : -1))
    const widest = shrinkable.indexOf(Math.max(...shrinkable))
    if (shrinkable[widest] < 0) break
    cols[widest] -= 1
  }
  return cols
}

/**
 * A table framed in box-drawing lines: rounded corners, a rule under the
 * head, a bar between columns, one space of padding in each cell. Columns are
 * fitted to `width`, frame included.
 */
function table(block: Extract<MdBlock, { type: 'table' }>, width: number, colour: boolean): string[] {
  const all = [block.header, ...block.rows]
  const natural = block.header.map((_, c) => Math.max(1, ...all.map((r) => displayWidth(inlineText(r[c] ?? [])))))
  // Each column takes its padding and a bar: 3 more than its text, plus the closing bar.
  const words = block.header.map((_, c) =>
    Math.max(1, ...all.flatMap((r) => inlineText(r[c] ?? []).split(/\s+/).map(displayWidth))),
  )
  const cols = fitColumns(natural, width - 3 * natural.length - 1, 0, words)
  const frame = (text: string) => paint([{ text, style: FRAME_STYLE }], colour)
  const rule = (left: string, joint: string, right: string) =>
    frame(left + cols.map((w) => RULE.repeat(w + 2)).join(joint) + right)
  const out: string[] = [rule(FRAME.tl, FRAME.top, FRAME.tr)]
  const row = (cells: readonly MdInline[][], head: boolean) => {
    const wrapped = cols.map((w, c) => wrap(segsOf(cells[c] ?? [], head ? STRONG : ''), w))
    const height = Math.max(...wrapped.map((l) => l.length))
    for (let i = 0; i < height; i++) {
      const line = wrapped.map((lines, c) => {
        const l = lines[i] ?? []
        return ` ${paint(l, colour)}${' '.repeat(Math.max(0, cols[c] - widthOf(l)))} `
      })
      out.push(frame(BAR) + line.join(frame(BAR)) + frame(BAR))
    }
  }
  row(block.header, true)
  out.push(rule(FRAME.left, FRAME.cross, FRAME.right))
  for (const r of block.rows) row(r, false)
  out.push(rule(FRAME.bl, FRAME.bottom, FRAME.br))
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
        // The frame already sets a table apart from the prose: a short indent will do.
        out.push(...table(b, Math.max(10, width - 2), colour).map((l) => `  ${l}`))
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
