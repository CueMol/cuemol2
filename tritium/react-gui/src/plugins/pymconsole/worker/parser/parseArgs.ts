/**
 * @file plugins/pymconsole/worker/parser/parseArgs.ts
 * @description Reading a command's argument list the way PyMOL reads it.
 *
 * A port of `parsing.parse_arg` (`modules/pymol/parsing.py`). Arguments are
 * comma-separated, may be named (`object=foo`), and may be quoted. The part
 * that makes this more than a `split(',')` is the nester: a selection like
 * `(chain A, chain B)` is ONE argument, so a bracketed group is taken whole,
 * commas and all.
 *
 * The rules are PyMOL's, not ours, down to the regexes. Diverging here would
 * mean a script that runs in PyMOL parses differently in the console, which
 * is the one thing a compatibility layer must not do.
 */

/** Argument parsing mode, from `parsing.py`'s keyword table. */
export type ArgMode = 'strict' | 'legacy' | 'literal1'

/** One argument as read: a name when it was given, and the raw text. */
export interface ParsedArg {
  /** The `name` of `name=value`, or null for a positional argument. */
  name: string | null
  /** The text, still a string; null for a blank argument (`a,,b`). */
  value: string | null
}

/** Thrown for a malformed argument list; the message is shown as-is. */
export class ParseError extends Error {}

// PyMOL's regexes (parsing.py:94-99), anchored so they match at the cursor.
const ARG_NAME_RE = /^[A-Za-z0-9_]+\s*=/
const NESTER_RE = /^[^,;]*[([]/
const ARG_PRE_NESTER_RE = /^([^,;([]+)[([]/
const ARG_POST_NESTER_RE = /^[^,;([]*/
const NESTER_CHAR_RE = /[()[\]]/g
const ARG_EASY_NESTER_RE = /^(?:\([^,]*\)|\[[^,]*\])/
const ARG_HARD_NESTER_RE = /^(?:\(.*\)|\[.*\])/
const ARG_VALUE_RE = /^(?:'''[^']*'''|'[^']*'|"[^"]*"|[^,;]+)/

/**
 * The single bracketed group starting at the front of `st`, or null when the
 * brackets never balance. A port of `parsing.trim_nester`.
 */
function trimNester(st: string): string | null {
  let depth = 1
  let c = 1
  while (c < st.length) {
    const ch = st[c]
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    c += 1
    if (depth === 0) return st.slice(0, c)
  }
  return null
}

function syntaxError(full: string, at: number, kind: number): never {
  throw new ParseError(`${full}\n${' '.repeat(at)}^ syntax error (type ${kind}).`)
}

/**
 * The arguments of one command line.
 *
 * @param line - the whole command, keyword included; the keyword is dropped
 *   the way PyMOL drops it (`split(None, 1)`).
 * @param mode - `literal1` takes everything after the first argument as one
 *   string, for the commands whose tail is an expression.
 */
export function parseArgs(line: string, mode: ArgMode = 'strict'): ParsedArg[] {
  const result: ParsedArg[] = []
  const head = line.trim().split(/\s+/)
  if (head.length < 2) return result

  // Everything after the first run of whitespace.
  let st = line.trim().replace(/^\S+\s+/, '')

  for (;;) {
    if (mode === 'literal1' && result.length === 1) {
      result.push({ name: null, value: st.trim() })
      return result
    }
    st = st.replace(/^\s+/, '')
    if (st === '') break

    let name: string | null = null
    const nameMatch = ARG_NAME_RE.exec(st)
    if (nameMatch) {
      name = nameMatch[0].slice(0, -1).trim()
      st = st.slice(nameMatch[0].length).replace(/^\s+/, '')
    }

    let cc = 0
    let consumed = false

    if (NESTER_RE.test(st)) {
      // One or more bracketed groups, with the text around them kept.
      let nest = ''
      let more = true
      while (more) {
        more = false
        const pre = ARG_PRE_NESTER_RE.exec(st.slice(cc))
        if (pre) {
          nest += pre[1]
          cc += pre[1].length
        }
        let easy = ARG_EASY_NESTER_RE.exec(st.slice(cc))
        if (easy) {
          // Brackets must balance in count, else fall through to the slow path.
          const chars = easy[0].match(NESTER_CHAR_RE)
          if ((chars?.length ?? 0) % 2 === 1) easy = null
        }
        if (easy) {
          nest += easy[0]
          cc += easy[0].length
          const post = ARG_POST_NESTER_RE.exec(st.slice(cc))
          if (post) {
            nest += post[0]
            cc += post[0].length
          }
          more = true
        } else {
          const hard = ARG_HARD_NESTER_RE.exec(st.slice(cc))
          if (hard) {
            const se = trimNester(hard[0])
            if (se === null) syntaxError(st, cc, 1)
            cc += se.length
            nest += se
            const post = ARG_POST_NESTER_RE.exec(st.slice(cc))
            if (post) {
              nest += post[0]
              cc += post[0].length
            }
            more = true
          }
        }
      }
      if (nest !== '') {
        result.push({ name, value: nest.trim() })
        consumed = true
      }
    }

    if (!consumed) {
      const valueMatch = ARG_VALUE_RE.exec(st.slice(cc))
      if (!valueMatch) {
        if (st.slice(cc, cc + 1) !== ',') syntaxError(st, cc, 2)
        result.push({ name, value: null })
      } else {
        let value = valueMatch[0]
        cc += valueMatch[0].length
        // Unquoted text following a quoted run belongs to the same argument.
        for (;;) {
          const more = ARG_VALUE_RE.exec(st.slice(cc))
          if (!more) break
          value += more[0]
          cc += more[0].length
        }
        result.push({ name, value: value.trim() })
      }
    }

    st = st.slice(cc).replace(/^\s+/, '')
    if (st === '') break
    if (!st.startsWith(',')) syntaxError(st, 0, 3)
    st = st.slice(1).replace(/^\s+/, '')
  }

  return result
}
