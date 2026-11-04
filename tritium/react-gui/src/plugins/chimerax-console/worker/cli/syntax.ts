/**
 * @file plugins/chimerax-console/worker/cli/syntax.ts
 * @description How the ChX console reads a line: ChimeraX's command language (cli.py).
 *
 * - **Split**: lines, then `;` outside quotes. A `#` where a command name
 *   would start makes the rest of the line a comment; a `#` inside the
 *   arguments is a model (`#1`) or a colour (`#ff0000`). There is no
 *   backslash continuation (it would break Windows paths).
 * - **Command name** (`_find_command_name`): each word is matched exactly,
 *   else by the first command in registration order it is a prefix of --
 *   never "ambiguous". Words after it are tried as sub-commands
 *   (`cartoon hide`); the first that is not one ends the name.
 * - **Arguments**: required positional ones, then optional positional ones
 *   (each ends at a word it cannot read, or at a keyword), then keywords.
 *   A keyword is matched ignoring case, by a prefix that names one keyword,
 *   or the one with the fewest camelCase words among several; given twice,
 *   it is an error (cli.py:3010-3080).
 */

import type { BindResult, DialectLine } from '@plugins/console/worker/dialect-api'
import { ArgError } from './argTypes'
import type { ChxArg, ChxCommand } from './command'
import { nextToken, splitOutsideQuotes } from './tokens'

/** The commands of a submission (or a `.cxc` file's text). */
export function splitLines(text: string): DialectLine[] {
  const out: DialectLine[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    // An alias definition takes the rest of the line, `;` included (alias.py `WholeRestOfLine`).
    if (/^\s*alias\s+(?!list\b|delete\b)\S+\s+\S/.test(line)) {
      const t = line.trim()
      out.push({ text: t, display: t, quiet: false, source: t })
      continue
    }
    for (const part of splitOutsideQuotes(line, ';')) {
      const t = part.trim()
      // A comment where a command would start: the rest of the line too.
      if (t.startsWith('#')) break
      if (t === '') continue
      out.push({ text: t, display: t, quiet: false, source: t })
    }
  }
  return out
}

/** The words of a line, as typed (no quotes are possible in a command name). */
function words(text: string): string[] {
  return text.trim().split(/\s+/)
}

/**
 * The command `text` names: the deepest command along its words, matched
 * exactly or by first prefix in registration order at each level.
 *
 * @returns the command and how many words its name took
 */
export function resolveWords(
  text: string,
  commands: readonly ChxCommand[],
): { spec: ChxCommand; taken: number } | { error: string } {
  const typed = words(text)
  let path: string[] = []
  let found: { spec: ChxCommand; taken: number } | null = null
  for (let i = 0; i < typed.length; i++) {
    const level = commands.filter((c) => c.words.length > i && path.every((w, k) => c.words[k] === w))
    // The candidate words at this level, in registration order, each once.
    const names = [...new Set(level.map((c) => c.words[i]))]
    const w = typed[i].toLowerCase()
    const word = names.find((n) => n === w) ?? (w === '' ? undefined : names.find((n) => n.startsWith(w)))
    if (word === undefined) break
    path = [...path, word]
    const exact = commands.find((c) => c.words.length === path.length && c.words.every((x, k) => x === path[k]))
    if (exact) found = { spec: exact, taken: path.length }
  }
  if (found) return found
  if (path.length > 0) return { error: `Error: incomplete command: "${path.join(' ')}"` }
  return { error: `Error: unknown command: "${typed[0] ?? ''}"` }
}

/** The text after the first `n` words. */
export function afterWords(text: string, n: number): string {
  return text.trim().replace(new RegExp(`^(?:\\S+\\s*){${n}}`), '')
}

/** How many camelCase words a keyword has (`bgColor`: 2). */
function wordCount(kw: string): number {
  return 1 + (kw.match(/[A-Z]/g)?.length ?? 0)
}

/**
 * The keyword `typed` names among `names`, or why none.
 *
 * @returns the keyword, null when `typed` is no keyword's prefix, or an error
 */
export function matchKeyword(typed: string, names: readonly string[]): string | null | { error: string } {
  const t = typed.toLowerCase()
  const exact = names.find((n) => n.toLowerCase() === t)
  if (exact) return exact
  const hits = names.filter((n) => n.toLowerCase().startsWith(t))
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0]
  const fewest = Math.min(...hits.map(wordCount))
  const short = hits.filter((n) => wordCount(n) === fewest)
  if (short.length === 1) return short[0]
  return { error: `"${typed}" is ambiguous: ${hits.join(', ')}` }
}

/** The keywords of a command: its optional positional arguments and its keyword arguments. */
export function keywordArgs(spec: ChxCommand): ChxArg[] {
  return spec.args.filter((a) => a.role !== 'required')
}

/** Whether `text` starts with a word that is a keyword's prefix (cli.py `_start_of_keywords`). */
function startsKeyword(text: string, spec: ChxCommand): boolean {
  const t = nextToken(text)
  if (!t || t.quoted || !/^[A-Za-z]/.test(t.value)) return false
  const m = matchKeyword(t.value, keywordArgs(spec).map((a) => a.name))
  return m !== null
}

/** A failure message with a caret under `at` in `line`. */
function caret(line: string, at: number, message: string): string {
  return `${line}\n${' '.repeat(Math.max(0, at))}^ ${message}`
}

/**
 * Bind a line's arguments to `spec`'s, defaults filled in. The values of
 * ignored keywords are kept under their names, so the command can warn.
 */
export function bindLine(spec: ChxCommand, line: string): BindResult {
  const full = line.trim()
  let rest = afterWords(full, spec.words.length)
  const at = () => full.length - rest.length
  const args: Record<string, string> = {}
  const read = (a: ChxArg): boolean | string => {
    const start = at()
    try {
      const r = a.type.parse(rest)
      if (!r) return false
      args[a.name] = r.value
      rest = r.rest
      return true
    } catch (e) {
      if (e instanceof ArgError) return caret(full, start + e.pos, e.message)
      throw e
    }
  }

  for (const a of spec.args.filter((x) => x.role === 'required')) {
    rest = rest.replace(/^\s+/, '')
    const ok = read(a)
    if (typeof ok === 'string') return { kind: 'error', error: ok }
    if (!ok) return { kind: 'error', error: caret(full, at(), `Missing or invalid ${a.name} argument: expected ${a.type.name}`) }
  }
  for (const a of spec.args.filter((x) => x.role === 'optional')) {
    rest = rest.replace(/^\s+/, '')
    if (rest === '' || startsKeyword(rest, spec)) break
    const ok = read(a)
    if (typeof ok === 'string') return { kind: 'error', error: ok }
    if (!ok && !a.type.mayBeEmpty) break
  }
  const given = new Set<string>()
  const kws = keywordArgs(spec)
  for (;;) {
    rest = rest.replace(/^\s+/, '')
    if (rest === '') break
    const word = nextToken(rest)
    if (!word) break
    const kw = matchKeyword(word.value, kws.map((a) => a.name))
    if (kw === null) return { kind: 'error', error: caret(full, at(), `Expected a keyword; "${word.value}" is not one`) }
    if (typeof kw !== 'string') return { kind: 'error', error: caret(full, at(), kw.error) }
    if (given.has(kw)) return { kind: 'error', error: caret(full, at(), `Repeated keyword: ${kw}`) }
    given.add(kw)
    const a = kws.find((x) => x.name === kw) as ChxArg
    rest = word.rest
    const valueAt = at()
    const ok = read(a)
    if (typeof ok === 'string') return { kind: 'error', error: ok }
    if (!ok) return { kind: 'error', error: caret(full, valueAt, `Missing or invalid ${kw} argument: expected ${a.type.name}`) }
  }
  for (const a of spec.args) if (!(a.name in args)) args[a.name] = a.default ?? ''
  return { kind: 'args', args }
}

/** The usage line (cli.py `usage`): the words, then the arguments as ChimeraX writes them. */
export function usageOf(spec: ChxCommand): string {
  if (spec.usageText !== undefined) return `${spec.name} ${spec.usageText}`.trim()
  const parts = spec.args.map((a) =>
    a.role === 'required' ? a.name : a.role === 'optional' ? `[${a.name}]` : `[${a.name} ${a.type.name}]`.replace(/ \]$/, ']'),
  )
  return [spec.name, ...parts].join(' ')
}
