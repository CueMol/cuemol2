/**
 * @file plugins/pymconsole/worker/sel/tokenize.ts
 * @description Cutting a PyMOL selection expression into words.
 *
 * PyMOL's own tokenizer, which is simpler than it looks: split on
 * whitespace, with parentheses as words of their own. Everything else --
 * whether `-` is a range, a minus sign or a subtraction; whether `+` joins
 * two values or two selections -- follows from that one rule, because a
 * separator only separates when it stands alone.
 *
 * `name CA+CB` is therefore one word and a list, while `A + B` is three words
 * and a union. Getting this wrong is the failure the whole translator exists
 * to avoid: a regex that rewrites `+` everywhere turns `name CA+CB` into
 * something that means a different set of atoms without erroring.
 */

/** One word of an expression, with where it started. */
export interface Token {
  kind: 'lparen' | 'rparen' | 'word'
  /** The word itself; empty for parentheses. */
  text: string
  /** Index in the source expression, for pointing at an error. */
  pos: number
}

/** Characters that end a word wherever they appear. */
const PUNCT = new Set(['(', ')'])

/** The words of `expr`, in order. */
export function tokenize(expr: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (PUNCT.has(ch)) {
      out.push({ kind: ch === '(' ? 'lparen' : 'rparen', text: ch, pos: i })
      i += 1
      continue
    }
    const start = i
    while (i < expr.length && !/\s/.test(expr[i]) && !PUNCT.has(expr[i])) i += 1
    out.push({ kind: 'word', text: expr.slice(start, i), pos: start })
  }
  return out
}
