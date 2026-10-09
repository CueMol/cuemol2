/**
 * @file plugins/console/worker/completion/complete.ts
 * @description What Tab does.
 *
 * A port of `Parser._complete` and `complete_sc` (`modules/pymol/parser.py`),
 * including the regexes, the fallbacks and the printed wording, because the
 * point of the feature is that a PyMOL user's fingers already know it.
 *
 * The shape to keep in mind: completion takes the whole line and answers with
 * the whole line. It does not insert at the caret. PyMOL's own GUI then
 * replaces the field and drops the caret at the end, and so does ours.
 *
 * Three outcomes, all of them PyMOL's:
 *
 * - one candidate -> the line is rewritten with it, plus the argument's
 *   separator (` ` or `, `). This is the only place a separator is added.
 * - several -> the list is printed and the line is extended to their common
 *   prefix, but only if that is strictly longer than what was typed. No
 *   separator.
 * - none -> a line saying so, and the line is left alone.
 *
 * Anything the catalogue cannot answer falls through to filenames, which is
 * why `load <TAB>` works without `load` declaring anything.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ConsoleEntry } from '../../shared/consoleTypes'
import { interpretShortcut } from '../parser/shortcut'
import { resolvePath } from '../runtime/paths'
import { assignArgs, nextPositional } from '../parser/bindArgs'
import { scanArgs } from '../parser/parseArgs'
import type { CompletionItem, ConsoleCommand, ConsoleDialect } from '../runtime/types'
import { commonPrefix, formatColumns } from './columns'

/** What Tab produced. */
export interface CompletionOutcome {
  /** The whole line, rewritten. Null leaves the line as typed. */
  replacement: string | null
  /** Lines to print: the candidate list, or why there was nothing. */
  messages: ConsoleEntry[]
}

/** Where a completion runs. */
export interface CompletionContext {
  sceneId: number
  viewId: number
  /** Directory a relative path completes against. */
  cwd: string
  /** The language whose commands and candidate sources are offered. */
  dialect: ConsoleDialect
}

function say(messages: ConsoleEntry[], text: string): void {
  messages.push({ kind: 'output', text })
}

function complain(messages: ConsoleEntry[], text: string): void {
  messages.push({ kind: 'warning', text })
}

/**
 * Resolve one pattern against one candidate list.
 *
 * `complete_sc` in PyMOL. Returns the text to put in place of `pattern`, or
 * null to leave it alone.
 */
function completeAgainst(
  pattern: string,
  candidates: readonly string[],
  description: string,
  suffix: string,
  messages: ConsoleEntry[],
  prefixSearchOnExact: boolean,
): string | null {
  const found = interpretShortcut(pattern, candidates, { prefixSearchOnExact })
  if (found.kind === 'none') {
    complain(messages, ` parser: no matching ${description}.`)
    return null
  }
  if (found.kind === 'found') return found.name + suffix

  // Names starting with an underscore are internal: they are neither listed
  // nor allowed to hold the common prefix back, though an exact one still
  // resolves above.
  const shown = found.candidates.filter((c) => !c.startsWith('_'))
  say(messages, ` parser: matching ${description}:`)
  for (const line of formatColumns(shown)) say(messages, line)

  const prefix = commonPrefix(shown)
  // Strictly longer: extending to what is already typed would look like a
  // no-op with a list printed under it, which is exactly what PyMOL shows.
  return prefix.length > pattern.length ? prefix : null
}

/** Directory entries starting with `stem`, directories marked with a slash. */
function fileCandidates(dir: string, stem: string): string[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => n.startsWith(stem))
    .sort()
    .map((n) => {
      try {
        // A trailing slash literally, not path.sep -- the console's paths are
        // written the way PyMOL writes them.
        return fs.statSync(path.join(dir, n)).isDirectory() ? `${n}/` : n
      } catch {
        return n
      }
    })
}

/**
 * Filename completion, PyMOL's fallback for everything the catalogue does
 * not describe.
 */
function completeFilename(
  line: string,
  cc: CompletionContext,
  messages: ConsoleEntry[],
): CompletionOutcome {
  const lastSep = Math.max(line.lastIndexOf(','), line.lastIndexOf('@'))
  const loc = lastSep >= 0 ? lastSep + 1 : line.indexOf(' ') + 1
  const pre = line.slice(0, loc)
  const typed = line.slice(loc).replace(/^\s+/, '')

  // Environment variables, as PyMOL does when nothing on disk matches.
  if (typed.startsWith('$')) {
    const vars = Object.keys(process.env)
      .filter((v) => v.startsWith(typed.slice(1)))
      .sort()
      .map((v) => `$${v}`)
    if (vars.length === 1) return { replacement: pre + vars[0], messages }
    if (vars.length > 1) {
      say(messages, ' parser: matching variables:')
      for (const l of formatColumns(vars)) say(messages, l)
      const prefix = commonPrefix(vars)
      return { replacement: prefix.length > typed.length ? pre + prefix : null, messages }
    }
  }

  const absolute = resolvePath(cc.cwd, typed)
  // A path ending in a separator is a directory to list, not a stem to match.
  const endsInDir = typed === '' || typed.endsWith('/') || typed.endsWith(path.sep)
  const dir = endsInDir ? absolute : path.dirname(absolute)
  const stem = endsInDir ? '' : path.basename(absolute)
  const hits = fileCandidates(dir, stem)

  if (hits.length === 0) {
    complain(messages, ' parser: no matching files.')
    return { replacement: null, messages }
  }
  // What the user typed, minus the part being completed: kept verbatim so a
  // relative path stays relative and `~` stays `~`.
  const typedDir = typed.slice(0, typed.length - stem.length)
  if (hits.length === 1) {
    return { replacement: pre + typedDir + hits[0], messages }
  }
  say(messages, ' parser: matching files:')
  for (const l of formatColumns(hits)) say(messages, l)
  const prefix = commonPrefix(hits)
  return {
    replacement: prefix.length > stem.length ? pre + typedDir + prefix : null,
    messages,
  }
}

/** A candidate as it is offered: its text, and what follows it once chosen. */
interface Offer {
  text: string
  /** Appended when this one is chosen alone. */
  sep: string
}

/**
 * One kind of thing the argument being typed can be (a parameter's values,
 * or the `name=` of a parameter not given yet), matched against its own
 * pattern: the line from `regionStart` on is what a choice replaces.
 */
interface Group {
  heading: string
  pattern: string
  regionStart: number
  offers: Offer[]
  /** Match by plain prefix (file names), not PyMOL's abbreviations. */
  plain?: boolean
}

/** Files under the typed path; a directory continues the path. */
function fileOffers(typed: string, cwd: string, sep: string): Offer[] {
  if (typed.startsWith('$')) {
    return Object.keys(process.env)
      .filter((v) => v.startsWith(typed.slice(1)))
      .sort()
      .map((v) => ({ text: `$${v}`, sep: '' }))
  }
  const absolute = resolvePath(cwd, typed)
  const endsInDir = typed === '' || typed.endsWith('/') || typed.endsWith(path.sep)
  const dir = endsInDir ? absolute : path.dirname(absolute)
  const stem = endsInDir ? '' : path.basename(absolute)
  // What was typed of the directory stays as typed: relative stays relative, `~` stays `~`.
  const typedDir = typed.slice(0, typed.length - stem.length)
  return fileCandidates(dir, stem).map((n) => ({ text: typedDir + n, sep: n.endsWith('/') ? '' : sep }))
}

/** The candidates of a group that the pattern selects. */
function matchesOf(g: Group): string[] {
  const texts = g.offers.map((o) => o.text)
  if (g.plain) return texts.filter((t) => t.startsWith(g.pattern))
  const found = interpretShortcut(g.pattern, texts, { prefixSearchOnExact: false })
  return found.kind === 'found' ? [found.name] : found.kind === 'ambiguous' ? found.candidates : []
}

/**
 * The line up to `at`, as PyMOL rebuilds it: the command abbreviation
 * written out, and the space after a last comma made exactly one.
 */
function prefixAt(line: string, at: number, commandName: string): string {
  return line
    .slice(0, at)
    .replace(/^\s*\S+\s*/, `${commandName} `)
    .replace(/,\s*$/, ', ')
}

/**
 * Complete an argument: everything the argument being typed can be, from
 * the same reading of the line execution makes (`scanArgs`, `assignArgs`).
 */
function completeArgument(
  ctx: WorkerContext,
  line: string,
  spec: ConsoleCommand,
  cc: CompletionContext,
  messages: ConsoleEntry[],
): CompletionOutcome | null {
  let scanned
  try {
    scanned = scanArgs(line, spec.mode, true)
  } catch {
    return null
  }
  const current = scanned.current
  if (!current) return null
  const rule = cc.dialect.argRule
  const { bound, given } = assignArgs(spec.name, spec.params, scanned.args, spec.mode, rule)
  const entryOf = (name: string) => spec.completions?.[spec.params.findIndex((p) => p.name === name)] ?? null

  // The parameter a value typed here goes to: the one named, or the next by position.
  const target = current.name ?? nextPositional(spec.params, scanned.args, rule)
  const known = target !== null && spec.params.some((p) => p.name === target)
  // Whether a parameter is still open once `p` is given: then a value ends with `, `.
  const moreAfter = (p: string) => spec.params.some((q) => q.name !== p && !given.has(q.name))

  const groups: Group[] = []
  const text = current.text
  // The word being typed: after the last space, comma or bracket (`(prot`).
  const lastWord = /[^, ()[\]]*$/.exec(text)?.[0] ?? ''
  const lastStart = current.valueStart + text.length - lastWord.length
  let valuesDeclined = !known

  if (known && target !== null) {
    const entry = entryOf(target)
    const sepFor = (then: CompletionItem['then']) =>
      then === 'continue' || entry?.open ? '' : (entry?.suffix ?? (moreAfter(target) ? ', ' : ''))
    const toOffers = (items: readonly (string | CompletionItem)[]) =>
      items.map((it) => (typeof it === 'string' ? { text: it, sep: sepFor('next') } : { text: it.text, sep: sepFor(it.then) }))

    if (entry?.source === 'files') {
      groups.push({ heading: 'files', pattern: text, regionStart: current.valueStart, offers: fileOffers(text, cc.cwd, sepFor('next')), plain: true })
    } else if (entry) {
      const ask = (pattern: string) =>
        cc.dialect.candidates(entry.source, ctx, { sceneId: cc.sceneId, viewId: cc.viewId, cwd: cc.cwd, bound, pattern })
      // The whole argument first, so a name with a space in it ("my scene")
      // can complete; the last word (of an expression) when nothing starts so.
      const whole = text !== lastWord ? ask(text) : null
      if (whole && whole.some((c) => (typeof c === 'string' ? c : c.text).startsWith(text))) {
        groups.push({ heading: entry.description, pattern: text, regionStart: current.valueStart, offers: toOffers(whole) })
      } else {
        const items = ask(lastWord)
        if (items === null) valuesDeclined = true
        else groups.push({ heading: entry.description, pattern: lastWord, regionStart: lastStart, offers: toOffers(items) })
      }
    } else {
      valuesDeclined = true
    }
    if (valuesDeclined && cc.dialect.fileFallback) {
      // PyMOL's own fallback: a file name is left as typed, nothing after it.
      groups.push({ heading: 'files', pattern: text, regionStart: current.valueStart, offers: fileOffers(text, cc.cwd, ''), plain: true })
    }
  }

  // The names of the parameters not given yet, which may be written here too.
  if (current.name === null) {
    const open = spec.params.filter((p) => !given.has(p.name))
    if (open.length > 0) {
      groups.push({
        heading: 'argument',
        pattern: text,
        regionStart: current.start,
        offers: open.map((p) => ({ text: `${p.name}=`, sep: '' })),
      })
    }
  }

  if (groups.length === 0) return null

  const matched = groups.map((g) => ({ g, hits: matchesOf(g) })).filter((m) => m.hits.length > 0)
  const total = matched.reduce((n, m) => n + m.hits.length, 0)
  if (total === 0) {
    const headings = [...new Set(groups.map((g) => g.heading))]
    complain(messages, ` parser: no matching ${headings.join(' or ')}.`)
    return { replacement: null, messages }
  }
  // Nothing typed, and the only match a parameter's name: list it rather
  // than write it, since the value itself is what the user came to type.
  const onlyName = matched.length === 1 && matched[0].g.heading === 'argument' && text === '' && known
  if (total === 1 && !onlyName) {
    const { g, hits } = matched[0]
    const offer = g.offers.find((o) => o.text === hits[0])
    return { replacement: prefixAt(line, g.regionStart, spec.name) + hits[0] + (offer?.sep ?? ''), messages }
  }

  // Several: list them by kind. Names starting with an underscore are
  // internal -- not listed, and not holding the common prefix back.
  const shown: string[] = []
  for (const { g, hits } of matched) {
    const visible = hits.filter((h) => !h.startsWith('_'))
    if (visible.length === 0) continue
    say(messages, ` parser: matching ${g.heading}:`)
    for (const l of formatColumns(visible)) say(messages, l)
    shown.push(...visible)
  }
  // The line grows to what they share -- strictly longer than what was
  // typed, else it would look like a no-op -- when they replace the same part.
  const first = matched[0].g
  if (onlyName || !matched.every((m) => m.g.regionStart === first.regionStart && m.g.pattern === first.pattern)) {
    return { replacement: null, messages }
  }
  const prefix = commonPrefix(shown)
  return {
    replacement: prefix.length > first.pattern.length ? prefixAt(line, first.regionStart, spec.name) + prefix : null,
    messages,
  }
}

/**
 * Complete one command line.
 *
 * @param line - the line as typed, without a trailing newline.
 * @returns the rewritten line and whatever should be printed.
 */
export function completeLine(
  ctx: WorkerContext,
  line: string,
  cc: CompletionContext,
): CompletionOutcome {
  const messages: ConsoleEntry[] = []
  const commands = cc.dialect.commands()
  const names = commands.map((c) => c.name)

  // --- the command word ---
  // PyMOL's test exactly: no space and no `@` anywhere means we are still on
  // the keyword. A leading space is therefore already argument territory.
  if (!line.includes(' ') && !line.includes('@')) {
    const result = completeAgainst(line, names, 'commands', ' ', messages, true)
    return { replacement: result === null ? null : result, messages }
  }

  // --- an argument ---
  const word = line.replace(/ .*/, '')
  const resolved = interpretShortcut(word, names)
  const spec = resolved.kind === 'found' ? commands.find((c) => c.name === resolved.name) : undefined
  if (spec) {
    const done = completeArgument(ctx, line, spec, cc, messages)
    if (done) return done
  }
  if (!cc.dialect.fileFallback && spec) {
    complain(messages, ' parser: nothing to complete here.')
    return { replacement: null, messages }
  }
  return completeFilename(line, cc, messages)
}
