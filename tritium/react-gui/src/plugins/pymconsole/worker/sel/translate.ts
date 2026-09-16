/**
 * @file plugins/pymconsole/worker/sel/translate.ts
 * @description Turning a PyMOL selection expression into a CueMol one.
 *
 * Entry point for the three steps in this directory: tokenize, parse at
 * PyMOL's priorities, print fully parenthesised. A failure names what could
 * not be carried across and where, because a selection that silently means a
 * different set of atoms is the worst thing a compatibility layer can do --
 * it looks like it worked.
 */

import { COMPARE_KEYWORDS, MACRO_KEYWORDS, PROP_KEYWORDS, SelParseError, parseSelection } from './parse'
import type { SelNode } from './parse'
import { UNSUPPORTED_MACROS, emitSelection } from './emit'

/** A translated expression, or why it could not be. */
export type TranslateResult =
  | { ok: true; expr: string }
  | { ok: false; error: string }

/**
 * `expr` as CueMol would write it.
 *
 * @param expr - a PyMOL selection expression.
 */
export function translateSelection(expr: string): TranslateResult {
  const trimmed = expr.trim()
  if (trimmed === '') return { ok: false, error: 'Error: the selection is empty' }
  try {
    return { ok: true, expr: emitSelection(parseSelection(trimmed)) }
  } catch (e) {
    if (e instanceof SelParseError) {
      // The caret line points at the word, the way the argument parser's
      // syntax errors do.
      return {
        ok: false,
        error: `${trimmed}\n${' '.repeat(Math.max(0, e.pos))}^ ${e.message}`,
      }
    }
    throw e
  }
}

/**
 * The selection keywords worth offering for completion.
 *
 * Derived from the translator's own tables rather than listed by hand, so a
 * keyword can never be offered after it stops being supported -- completing
 * a line into an expression that refuses to run is worse than not completing
 * it. Abbreviations (`c.`, `br.`) are left out, as PyMOL leaves them out of
 * its own list; a keyword that takes a value carries a trailing space so the
 * caret lands where the value goes.
 */
export function selectionKeywords(): string[] {
  // Keywords the parser accepts but the emitter refuses, which the tables
  // alone do not say: `rank` has no CueMol counterpart, and the two charge
  // properties parse as comparisons but only `b` and `q` can be emitted.
  const emitterRefuses = new Set(['rank', 'partial_charge', 'formal_charge'])
  const canonical = (table: Readonly<Record<string, string>>): string[] =>
    [...new Set(Object.values(table))].filter((k) => !emitterRefuses.has(k))
  return [
    ...canonical(PROP_KEYWORDS).map((k) => `${k} `),
    ...canonical(COMPARE_KEYWORDS).map((k) => `${k} `),
    ...[...MACRO_KEYWORDS].filter((k) => k !== '*' && UNSUPPORTED_MACROS[k] === undefined),
    'byres ',
    'around ',
    'expand ',
    'within ',
    'near_to ',
    'beyond ',
    'not ',
    'and ',
    'or ',
  ]
}

/**
 * The bare names an expression mentions, in the order they appear.
 *
 * A bare word in a PyMOL selection is an object or a named selection, and
 * `translateSelection` passes it through untouched. A caller that has to
 * pick one molecule to evaluate the expression against -- CueMol evaluates
 * per molecule, PyMOL over the whole scene -- uses this to see whether the
 * user already named one.
 *
 * @returns an empty array when the expression does not parse; the caller is
 *   translating it anyway and will report the error from there.
 */
export function selectionNames(expr: string): string[] {
  let node: SelNode
  try {
    node = parseSelection(expr.trim())
  } catch {
    return []
  }
  const out: string[] = []
  const walk = (n: SelNode): void => {
    switch (n.kind) {
      case 'name':
        out.push(n.name)
        return
      case 'and':
      case 'or':
      case 'sub':
      case 'twoset':
        walk(n.left)
        walk(n.right)
        return
      case 'not':
      case 'byres':
      case 'prox':
        walk(n.operand)
        return
      default:
        return
    }
  }
  walk(node)
  return out
}
