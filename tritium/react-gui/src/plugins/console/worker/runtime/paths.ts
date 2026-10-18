/**
 * @file plugins/console/worker/runtime/paths.ts
 * @description Turning a typed path into a file the worker can open, and a
 * typed list of paths, wildcards and all, into the files it names.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { globLiteral, globToRegExp, isGlob, unglob } from '@renderer/worker/server/catalog/glob'

/** Expand a leading `~` and make a relative path absolute against `cwd`. */
export function resolvePath(cwd: string, filePath: string): string {
  const expanded = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded)
}

// --- Lists of paths, as zsh reads them ---

/** One word of a list, where it starts in the text, and what it names. */
export interface PathWord {
  /** As typed, quotes and escapes included. */
  raw: string
  /** Offset of `raw` in the text. */
  start: number
  /** With quotes and escapes removed. */
  value: string
  /**
   * As a pattern (`glob.ts`): a wildcard typed bare stays one, and a quoted
   * or escaped `*` `?` or a backslash is escaped, so it matches only itself.
   */
  pattern: string
  /** Whether a bare `*` or `?` makes it a pattern. */
  glob: boolean
}

/**
 * Split a list into words, as zsh splits a command line: whitespace
 * separates them, quotes (`'...'`, `"..."`) and a backslash before a space,
 * quote, wildcard or backslash keep what they cover literal. Any other
 * backslash is kept, since it separates directories on Windows. An unclosed
 * quote runs to the end, so a word being typed still reads.
 */
export function splitPathWords(text: string): PathWord[] {
  const words: PathWord[] = []
  let cur: PathWord | null = null
  let quote: string | null = null
  const literal = (w: PathWord, ch: string) => {
    w.value += ch
    w.pattern += globLiteral(ch)
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote === null && /\s/.test(ch)) {
      if (cur) words.push(cur)
      cur = null
      continue
    }
    cur ??= { raw: '', start: i, value: '', pattern: '', glob: false }
    cur.raw += ch
    if (quote !== null) {
      if (ch === quote) quote = null
      else literal(cur, ch)
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '\\' && i + 1 < text.length && /[\s"'*?\\]/.test(text[i + 1])) {
      cur.raw += text[++i]
      literal(cur, text[i])
    } else if (ch === '*' || ch === '?') {
      cur.glob = true
      cur.value += ch
      cur.pattern += ch
    } else {
      literal(cur, ch)
    }
  }
  if (cur) words.push(cur)
  return words
}

/** Whether a name must be quoted in a list: `,` `;` would end the argument, a quote would open one. */
function needsQuotes(s: string): boolean {
  return /[,;"']/.test(s)
}

function quoted(s: string): string {
  return s.includes('"') ? `'${s}'` : `"${s}"`
}

/**
 * A path as it is written in a list: `,` `;` or a quote put it in quotes;
 * otherwise spaces, wildcards and backslashes before them are escaped with a
 * backslash, as zsh writes them.
 */
export function pathWord(p: string): string {
  return needsQuotes(p) ? quoted(p) : p.replace(/\\(?=[\s*?\\"'])|[\s*?]/g, '\\$&')
}

/**
 * A node path (`refs.ts`) as it is written in a list: like `pathWord`, except
 * that a wildcard after the `@` of a type is left bare, since a type is never
 * a pattern (`1crn/@*selection`).
 */
export function refWord(p: string): string {
  if (needsQuotes(p)) return quoted(p)
  return p
    .split('/')
    .map((seg) => {
      const at = seg.lastIndexOf('@')
      const name = at < 0 ? seg : seg.slice(0, at)
      return pathWord(name) + (at < 0 ? '' : seg.slice(at).replace(/\s/g, '\\$&'))
    })
    .join('/')
}

/** The segments of a path pattern: `/`, and on Windows a backslash that is not an escape. */
function segmentsOf(pattern: string): string[] {
  if (process.platform !== 'win32') return pattern.split('/')
  // A literal backslash is written `\\` in a pattern (globLiteral).
  return pattern.split(/\/|\\\\/)
}

/**
 * The paths a pattern (`PathWord.pattern`) matches, written as typed
 * (`~/pdb/1crn.pdb` stays under `~`, a relative one stays relative), sorted
 * per directory. `*` and `?` match within one directory level, and a dot
 * file only when the pattern's segment starts with a dot (zsh without
 * `GLOB_DOTS`).
 */
export function expandGlob(cwd: string, pattern: string): string[] {
  const parts = segmentsOf(pattern)
  let first = 0
  while (first < parts.length - 1 && !isGlob(parts[first])) first++
  let found = [parts.slice(0, first).map((p) => `${unglob(p)}/`).join('')]
  const statOf = (typed: string) => {
    try {
      return fs.statSync(resolvePath(cwd, typed === '' ? '.' : typed))
    } catch {
      return null
    }
  }
  for (let k = first; k < parts.length; k++) {
    const seg = parts[k]
    const last = k === parts.length - 1
    const next: string[] = []
    for (const typed of found) {
      if (!isGlob(seg)) {
        const name = unglob(seg)
        const st = statOf(typed + name)
        if (st && (last || st.isDirectory())) next.push(last ? typed + name : `${typed}${name}/`)
        continue
      }
      let names: string[]
      try {
        names = fs.readdirSync(resolvePath(cwd, typed === '' ? '.' : typed)).sort()
      } catch {
        continue
      }
      const re = globToRegExp(seg)
      for (const n of names) {
        if ((n.startsWith('.') && !seg.startsWith('.')) || !re.test(n)) continue
        if (last) next.push(typed + n)
        else if (statOf(typed + n)?.isDirectory()) next.push(`${typed}${n}/`)
      }
    }
    found = next
  }
  return found
}

/** What a path list names: the files, and the patterns that matched none. */
export interface PathList {
  files: string[]
  unmatched: string[]
  /** Whether any word was a pattern. */
  glob: boolean
}

/** Read a path list (`splitPathWords`), expanding each pattern (`expandGlob`). */
export function readPathList(cwd: string, text: string): PathList {
  const out: PathList = { files: [], unmatched: [], glob: false }
  for (const w of splitPathWords(text)) {
    if (!w.glob) {
      out.files.push(w.value)
      continue
    }
    out.glob = true
    const hits = expandGlob(cwd, w.pattern)
    if (hits.length === 0) out.unmatched.push(w.raw)
    out.files.push(...hits)
  }
  return out
}
