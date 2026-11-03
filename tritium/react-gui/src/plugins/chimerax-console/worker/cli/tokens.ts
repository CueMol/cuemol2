/**
 * @file plugins/chimerax-console/worker/cli/tokens.ts
 * @description Reading one word of a ChimeraX command line.
 *
 * Words are separated by white space and may be quoted with `'...'` or
 * `"..."` (cli.py `next_token`). Escape sequences are converted only where
 * cli.py converts them -- string and enum values -- and never in a file
 * name, so a Windows path such as `"C:\Users\x.png"` keeps its backslashes
 * (cli.py:1208, `FileNameArg` calls `next_token` without `convert`).
 */

/** One word as read: its value (quotes removed), and what is left after it. */
export interface Token {
  value: string
  /** The text after the word, leading white space removed. */
  rest: string
  /** The word was quoted. */
  quoted: boolean
}

/** The simple escapes cli.py `unescape` understands. */
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' }

/** `text` with `\n`, `\t`, `\\` and quote escapes converted (cli.py `unescape`, without `\N{...}`). */
export function unescape(text: string): string {
  return text.replace(/\\([nt\\'"])/g, (_m, c: string) => ESCAPES[c])
}

/**
 * The first word of `text`, or null when there is none.
 *
 * @param text - starts at the word (leading white space is skipped)
 */
export function nextToken(text: string): Token | null {
  const s = text.replace(/^\s+/, '')
  if (s === '') return null
  const q = s[0]
  if (q === '"' || q === "'") {
    const end = s.indexOf(q, 1)
    // An unclosed quote takes the rest of the line, as cli.py reports it as
    // incomplete; reading it whole lets the caller say so.
    if (end < 0) return { value: s.slice(1), rest: '', quoted: true }
    return { value: s.slice(1, end), rest: s.slice(end + 1).replace(/^\s+/, ''), quoted: true }
  }
  const m = /^\S+/.exec(s) as RegExpExecArray
  return { value: m[0], rest: s.slice(m[0].length).replace(/^\s+/, ''), quoted: false }
}

/**
 * Where `text` splits at `sep` outside quotes, as cli.py splits a line into
 * commands at `;`.
 */
export function splitOutsideQuotes(text: string, sep: string): string[] {
  const out: string[] = []
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === sep) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out
}
