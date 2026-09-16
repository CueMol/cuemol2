/**
 * @file plugins/pymconsole/worker/parser/splitCommands.ts
 * @description Cutting submitted text into the command lines to run.
 *
 * A port of what PyMOL's parser does before it looks at a keyword
 * (`modules/pymol/parser.py`): join continuation lines, drop comments, and
 * split on `;` without cutting inside a quoted string or a selection's
 * parentheses. The last part is why this is not `text.split(';')` --
 * `select foo, (chain A; chain B)` is one command in PyMOL, and a naive split
 * would silently make two.
 *
 * Lines starting `/` (literal Python) and `@` (run a script file) are
 * recognised here so the caller can report them by name rather than as an
 * unknown command.
 */

/** One command as typed, with what PyMOL's prefixes said about it. */
export interface SplitCommand {
  /** The command text, with any echo-suppression prefix removed. */
  text: string
  /** `_ ` prefix: run it, but keep it out of the transcript. */
  quiet: boolean
  /** `/` prefix: PyMOL would hand the rest to Python. */
  python: boolean
  /** `@` prefix: PyMOL would run the named file as a script. */
  script: boolean
}

/** The bracket and quote pairs `;` may not be split inside. */
const PAIRS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  "'": "'",
  '"': '"',
}

/**
 * Split one line on `tok`, preserving quoted strings and bracketed groups.
 *
 * A port of `parsing.split()`. The stack holds the closer being waited for,
 * so a quote inside brackets and brackets inside a quote both behave the way
 * PyMOL's does.
 */
export function splitPreservingGroups(line: string, tok: string): string[] {
  const stack: string[] = []
  const out: string[] = []
  let word = ''
  for (const ch of line) {
    if (ch === tok && stack.length === 0) {
      out.push(word.trim())
      word = ''
      continue
    }
    if (stack.length > 0) {
      if (ch === stack[0]) stack.shift()
      else if (ch in PAIRS) stack.unshift(PAIRS[ch])
    } else if (ch in PAIRS) {
      stack.unshift(PAIRS[ch])
    }
    word += ch
  }
  if (word.length > 0) out.push(word.trim())
  return out
}

/** Join lines ending in a backslash onto the line that follows. */
function joinContinuations(text: string): string[] {
  const out: string[] = []
  let pending = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.endsWith('\\')) {
      pending += line.slice(0, -1)
      continue
    }
    out.push(pending + line)
    pending = ''
  }
  if (pending !== '') out.push(pending)
  return out
}

/** Read and strip the prefix PyMOL gives a line a special meaning with. */
function readPrefixes(text: string): SplitCommand {
  // `_ ` is PyMOL's "run this without echoing it" marker (parser.py:427).
  if (text.startsWith('_ ') || text === '_') {
    return { text: text.slice(2).trim(), quiet: true, python: false, script: false }
  }
  if (text.startsWith('/')) {
    return { text: text.slice(1).trim(), quiet: false, python: true, script: false }
  }
  if (text.startsWith('@')) {
    return { text: text.slice(1).trim(), quiet: false, python: false, script: true }
  }
  return { text, quiet: false, python: false, script: false }
}

/**
 * The commands in a block of submitted text, in order.
 *
 * Blank lines and whole-line `#` comments are dropped, so pasting a script
 * runs what the script would run.
 */
export function splitCommands(text: string): SplitCommand[] {
  const out: SplitCommand[] = []
  for (const line of joinContinuations(text)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    for (const part of splitPreservingGroups(trimmed, ';')) {
      const cmd = readPrefixes(part.trim())
      if (cmd.text === '' && !cmd.python && !cmd.script) continue
      out.push(cmd)
    }
  }
  return out
}
