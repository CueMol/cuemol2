/**
 * @file markdown.ts
 * @description Console output marked `format: 'markdown'` (help, for now),
 * read once into a small block tree that both renderers draw: React in the
 * panel (react-gui h3-kit/markdown) and ANSI in tritium_cli.
 *
 * `marked` does the reading; this narrows its tokens to the few a console
 * shows -- headings, paragraphs, lists, tables, code, quotes, rules, and
 * strong / em / code spans inside them. Anything else (a link, raw HTML)
 * comes out as its text, so nothing is ever injected as markup.
 */

import { Lexer } from 'marked'
import type { Token, Tokens } from 'marked'

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'br' }

export type MdAlign = 'left' | 'right' | 'center' | null

export type MdBlock =
  | { type: 'heading'; depth: number; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { type: 'table'; align: MdAlign[]; header: MdInline[][]; rows: MdInline[][][] }
  | { type: 'quote'; children: MdBlock[] }
  | { type: 'hr' }

function inlines(tokens: readonly Token[] | undefined, raw: string): MdInline[] {
  if (!tokens) return [{ type: 'text', text: raw }]
  const out: MdInline[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'strong':
      case 'em':
      case 'del':
        out.push({ type: t.type === 'em' ? 'em' : 'strong', children: inlines((t as Tokens.Strong).tokens, t.raw) })
        break
      case 'codespan':
        out.push({ type: 'code', text: (t as Tokens.Codespan).text })
        break
      case 'br':
        out.push({ type: 'br' })
        break
      case 'text':
      case 'link':
        // A text token may hold inline tokens of its own (in a tight list item).
        if ('tokens' in t && t.tokens) out.push(...inlines(t.tokens, t.raw))
        else out.push({ type: 'text', text: (t as Tokens.Text).text })
        break
      default:
        // escape, html, image...: as the text they stand for.
        out.push({ type: 'text', text: 'text' in t && typeof t.text === 'string' ? t.text : t.raw })
    }
  }
  return out
}

function blocks(tokens: readonly Token[]): MdBlock[] {
  const out: MdBlock[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
        break
      case 'heading':
        out.push({ type: 'heading', depth: (t as Tokens.Heading).depth, children: inlines(t.tokens, t.raw) })
        break
      case 'paragraph':
      case 'text':
        out.push({ type: 'paragraph', children: inlines(t.tokens, (t as Tokens.Text).text) })
        break
      case 'code':
        out.push({ type: 'code', text: (t as Tokens.Code).text })
        break
      case 'list': {
        const l = t as Tokens.List
        out.push({
          type: 'list',
          ordered: l.ordered,
          start: typeof l.start === 'number' ? l.start : 1,
          items: l.items.map((it) => blocks(it.tokens)),
        })
        break
      }
      case 'table': {
        const tb = t as Tokens.Table
        out.push({
          type: 'table',
          align: tb.align,
          header: tb.header.map((c) => inlines(c.tokens, c.text)),
          rows: tb.rows.map((r) => r.map((c) => inlines(c.tokens, c.text))),
        })
        break
      }
      case 'blockquote':
        out.push({ type: 'quote', children: blocks((t as Tokens.Blockquote).tokens) })
        break
      case 'hr':
        out.push({ type: 'hr' })
        break
      default:
        // html and the like: shown as written.
        out.push({ type: 'paragraph', children: [{ type: 'text', text: t.raw.trim() }] })
    }
  }
  return out
}

/** `src` as console blocks. */
export function parseMarkdown(src: string): MdBlock[] {
  return blocks(new Lexer({ gfm: true }).lex(src))
}

/** The plain text of inline content, for measuring a table cell. */
export function inlineText(parts: readonly MdInline[]): string {
  return parts
    .map((p) => (p.type === 'text' || p.type === 'code' ? p.text : p.type === 'br' ? ' ' : inlineText(p.children)))
    .join('')
}
