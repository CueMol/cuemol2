/**
 * @file h3-kit/markdown/MarkdownBlock.tsx
 * @description Markdown text drawn as React elements (console help, for now).
 *
 * Parsed by @cuemol/console-kit `parseMarkdown`, the same reading tritium_cli
 * draws in ANSI, so the panel and the terminal show one document. Elements
 * are built from the block tree; no HTML string is ever set, so a `<script>`
 * in the text is just text. Sizes and colours are `styles/_markdown-kit.css`.
 */

import React from 'react'
import { parseMarkdown } from '@cuemol/console-kit'
import type { MdBlock, MdInline } from '@cuemol/console-kit'

void React

function Inlines({ parts }: { parts: readonly MdInline[] }): React.ReactElement {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.type) {
          case 'text':
            return <React.Fragment key={i}>{p.text}</React.Fragment>
          case 'code':
            return <code key={i} className="md-codespan">{p.text}</code>
          case 'strong':
            return <strong key={i} className="md-strong"><Inlines parts={p.children} /></strong>
          case 'em':
            return <em key={i} className="md-em"><Inlines parts={p.children} /></em>
          case 'br':
            return <br key={i} />
        }
      })}
    </>
  )
}

function Block({ block }: { block: MdBlock }): React.ReactElement {
  switch (block.type) {
    case 'heading':
      return (
        <div className={`md-heading md-h${Math.min(block.depth, 3)}`} role="heading" aria-level={block.depth}>
          <Inlines parts={block.children} />
        </div>
      )
    case 'paragraph':
      return <p className="md-p"><Inlines parts={block.children} /></p>
    case 'code':
      return <pre className="md-code">{block.text}</pre>
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>{item.map((b, k) => <Block key={k} block={b} />)}</li>
      ))
      return block.ordered
        ? <ol className="md-list" start={block.start}>{items}</ol>
        : <ul className="md-list">{items}</ul>
    }
    case 'table':
      return (
        <table className="md-table">
          <thead>
            <tr>
              {block.header.map((c, i) => (
                <th key={i} style={block.align[i] ? { textAlign: block.align[i] ?? undefined } : undefined}>
                  <Inlines parts={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i} style={block.align[i] ? { textAlign: block.align[i] ?? undefined } : undefined}>
                    <Inlines parts={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'quote':
      return <blockquote className="md-quote">{block.children.map((b, i) => <Block key={i} block={b} />)}</blockquote>
    case 'hr':
      return <hr className="md-hr" />
  }
}

export interface MarkdownBlockProps {
  /** The Markdown source. */
  text: string
  className?: string
}

export const MarkdownBlock: React.FC<MarkdownBlockProps> = ({ text, className }) => (
  <div className={className ? `md ${className}` : 'md'}>
    {parseMarkdown(text).map((b, i) => <Block key={i} block={b} />)}
  </div>
)
MarkdownBlock.displayName = 'MarkdownBlock'
