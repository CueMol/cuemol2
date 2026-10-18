/**
 * @file worker/server/catalog/glob.ts
 * @description The one name-pattern syntax the consoles share: node names
 * (`refs.ts`), PyMOL names, and file names in a path list.
 *
 * `*` matches any run of characters and `?` any one, as in zsh. A backslash
 * makes the character after it literal (`\*` is a star), which is how a word
 * read from a command line keeps a quoted or escaped wildcard from matching.
 */

/** Turn a name pattern into a matcher. */
export function globToRegExp(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) re += escapeRe(pattern[++i])
    else if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else re += escapeRe(ch)
  }
  return new RegExp(`^${re}$`)
}

function escapeRe(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch
}

/** Whether a pattern has a wildcard that is not escaped. */
export function isGlob(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') i++
    else if (pattern[i] === '*' || pattern[i] === '?') return true
  }
  return false
}

/** A pattern with no wildcard, as the name it stands for: its escapes removed. */
export function unglob(pattern: string): string {
  return pattern.replace(/\\(.)/g, '$1')
}

/** A name written as a pattern that matches only itself. */
export function globLiteral(name: string): string {
  return name.replace(/[*?\\]/g, '\\$&')
}
