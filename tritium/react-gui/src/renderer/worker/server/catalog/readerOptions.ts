/**
 * @file worker/server/catalog/readerOptions.ts
 * @description The File Open dialog's reader options, as text a command takes.
 *
 * `load_file` starts from the options the dialog starts with (the reader's
 * own defaults) and overrides the ones written as `key=value` pairs, keyed by
 * the dialog's option names (`build2ndry=false`, `columnF=FWT`). A value is
 * read by the type of the option it replaces. The companion file of a
 * two-file format (MSMS .vert, NAMD .psf, AMBER coordinates) is not one of
 * these: it is a path, which the caller resolves like the file itself.
 */

import type { FormatOptions } from '@renderer/worker/shared/fileOpenTypes'

/** The option holding the companion file, per format; not set through the text. */
const COMPANION_KEY: Partial<Record<FormatOptions['kind'], string>> = {
  msms: 'vertFilePath',
  namdcoor: 'psfFilePath',
  amberprm: 'coordFilePath',
}

/** Options whose value is one of a closed set. */
const CHOICES: Readonly<Record<string, readonly string[]>> = {
  mapType: ['auto', 'xtal', 'em'],
}

/**
 * Setting a value implies its switch: `truncateMin=0` means "truncate at 0",
 * and `columnW=FOM` means "use the weight column".
 */
const IMPLIES: Readonly<Record<string, string>> = {
  truncateMin: 'truncateMinEnabled',
  truncateMax: 'truncateMaxEnabled',
  columnPhi: 'phaseEnabled',
  columnW: 'weightEnabled',
}

/** The options a command may set for this format, with their current values. */
export function settableReaderOptions(format: FormatOptions): Record<string, string | number | boolean> {
  const skip = COMPANION_KEY[format.kind]
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(format.options as Record<string, unknown>)) {
    if (k !== skip && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) out[k] = v
  }
  return out
}

/** One value as the option's type takes it, or why it is not one. */
function readValue(key: string, current: string | number | boolean, text: string): string | number | boolean | { error: string } {
  if (typeof current === 'boolean') {
    if (/^(true|on|yes|1)$/i.test(text)) return true
    if (/^(false|off|no|0)$/i.test(text)) return false
    return { error: `${key} takes true or false.` }
  }
  if (typeof current === 'number') {
    const n = Number(text)
    return text !== '' && Number.isFinite(n) ? n : { error: `${key} takes a number.` }
  }
  const choices = CHOICES[key]
  if (choices && !choices.includes(text)) return { error: `${key} takes one of: ${choices.join(', ')}.` }
  return text
}

/**
 * Override the format options with `key=value` pairs (separated by spaces or
 * commas). Keys match case-insensitively. Returns the new options, or why the
 * text names an option the format does not have or a value it does not take.
 */
export function applyReaderOptionText(format: FormatOptions, text: string): FormatOptions | { error: string } {
  const settable = settableReaderOptions(format)
  const keys = Object.keys(settable)
  const next: Record<string, unknown> = { ...(format.options as Record<string, unknown>) }
  const given = new Set<string>()
  for (const pair of text.split(/[\s,]+/).filter((t) => t !== '')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) return { error: `"${pair}" is not key=value.` }
    const want = pair.slice(0, eq)
    const key = keys.find((k) => k.toLowerCase() === want.toLowerCase())
    if (!key) {
      return {
        error: keys.length > 0
          ? `This reader has no option "${want}". Its options: ${keys.join(', ')}.`
          : 'This reader takes no options.',
      }
    }
    const value = readValue(key, settable[key], pair.slice(eq + 1))
    if (typeof value === 'object') return value
    next[key] = value
    given.add(key)
  }
  for (const key of given) {
    const sw = IMPLIES[key]
    if (sw && !given.has(sw) && sw in next) next[sw] = next[key] !== ''
  }
  return { ...format, options: next } as FormatOptions
}

/** Set the companion file of a two-file format, or say the format has none. */
export function withCompanionFile(format: FormatOptions, filePath: string): FormatOptions | { error: string } {
  const key = COMPANION_KEY[format.kind]
  if (!key) return { error: 'This format reads one file; it takes no companion file.' }
  return { ...format, options: { ...(format.options as Record<string, unknown>), [key]: filePath } } as FormatOptions
}
