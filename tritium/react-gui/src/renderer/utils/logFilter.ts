/**
 * @file utils/logFilter.ts
 * @description VSCode-style line filter for the bottom Output panel.
 *
 * The filter string is split on whitespace into tokens. A token may be
 * prefixed with `!` to mark it as an exclusion; bare tokens are inclusions.
 * A line passes when it contains every inclusion token (substring,
 * case-insensitive) and contains none of the exclusion tokens.
 */

export interface ParsedFilter {
  /** Tokens that must all be present (case-insensitive substring). */
  include: string[]
  /** Tokens that must all be absent (case-insensitive substring). */
  exclude: string[]
}

/**
 * Split the filter string into inclusion and exclusion tokens.
 *
 * Whitespace separates tokens. A leading `!` flips a token to exclusion;
 * a bare `!` (no body) is ignored. Token comparison is case-insensitive,
 * so tokens are lower-cased here.
 */
export function parseFilter(filter: string): ParsedFilter {
  const include: string[] = []
  const exclude: string[] = []
  for (const raw of filter.split(/\s+/)) {
    if (!raw) continue
    if (raw.startsWith('!')) {
      const body = raw.slice(1)
      if (body) exclude.push(body.toLowerCase())
    } else {
      include.push(raw.toLowerCase())
    }
  }
  return { include, exclude }
}

/**
 * Apply the parsed filter to a single line.
 */
function lineMatches(line: string, parsed: ParsedFilter): boolean {
  const lower = line.toLowerCase()
  for (const tok of parsed.include) {
    if (!lower.includes(tok)) return false
  }
  for (const tok of parsed.exclude) {
    if (lower.includes(tok)) return false
  }
  return true
}

/**
 * Filter the accumulated log text line-by-line.
 *
 * An empty filter (or one with no usable tokens) returns the input
 * unchanged. A trailing newline in the input is preserved so the live
 * log keeps appending below the last filtered line.
 */
export function applyLogFilter(contents: string, filter: string): string {
  const parsed = parseFilter(filter)
  if (parsed.include.length === 0 && parsed.exclude.length === 0) {
    return contents
  }
  const hadTrailingNewline = contents.endsWith('\n')
  const body = hadTrailingNewline ? contents.slice(0, -1) : contents
  const kept = body.split('\n').filter((line) => lineMatches(line, parsed))
  if (kept.length === 0) return ''
  const out = kept.join('\n')
  return hadTrailingNewline ? out + '\n' : out
}
