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
 * Three outcomes:
 *
 * - one candidate -> the line is rewritten with it, plus the argument's
 *   separator (` ` or `, `).
 * - several -> they are returned as candidates, each with the line it
 *   stands for (separator included), for the client to list and walk as zsh
 *   does (@cuemol/console-kit completion.ts); the line is extended to their
 *   common prefix, but only if that is strictly longer than what was typed.
 * - none -> a line saying so, and the line is left alone.
 *
 * File names follow zsh rather than PyMOL: dot files only when a dot is
 * typed, a case-insensitive retry when nothing matches as typed, for a load
 * the files it opens first, for `cd` directories only (ArgCompletion.files).
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
import type { ArgCompletion, CompletionItem, ConsoleCommand, ConsoleDialect } from '../runtime/types'
import { commonPrefix } from '@cuemol/console-kit'
import type { CandidateKind, CompletionCandidate } from '@cuemol/console-kit'
import { hasExt } from '@shared/fileExt'
import { openableExtensions } from '@renderer/worker/server/catalog/fileLoad'

/** What Tab produced. */
export interface CompletionOutcome {
  /** The whole line, rewritten. Null leaves the line as typed. */
  replacement: string | null
  /** Why there was nothing to complete. */
  messages: ConsoleEntry[]
  /** Two or more candidates, for the client to list and walk. */
  candidates?: CompletionCandidate[]
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

function complain(messages: ConsoleEntry[], text: string): void {
  messages.push({ kind: 'warning', text })
}

/**
 * The command word against the command names.
 *
 * `complete_sc` in PyMOL, with the list returned instead of printed.
 */
function completeCommand(line: string, names: readonly string[], messages: ConsoleEntry[]): CompletionOutcome {
  const found = interpretShortcut(line, names, { prefixSearchOnExact: true })
  if (found.kind === 'none') {
    complain(messages, ' parser: no matching commands.')
    return { replacement: null, messages }
  }
  if (found.kind === 'found') return { replacement: `${found.name} `, messages }

  // Names starting with an underscore are internal: they are neither listed
  // nor allowed to hold the common prefix back, though an exact one still
  // resolves above.
  const shown = found.candidates.filter((c) => !c.startsWith('_'))
  const prefix = commonPrefix(shown)
  return {
    // Strictly longer: extending to what is already typed is a no-op.
    replacement: prefix.length > line.length ? prefix : null,
    messages,
    candidates: shown.map((c) => ({ label: c, replacement: `${c} `, kind: 'command', group: 'commands' })),
  }
}

/**
 * The longest prefix `items` share. When they matched `pattern` only
 * ignoring case (fileEntries' retry), case is ignored here too and the
 * first item's spelling is taken.
 */
function sharedPrefix(items: readonly string[], pattern: string): string {
  if (items.every((t) => t.startsWith(pattern))) return commonPrefix(items)
  const folded = commonPrefix(items.map((t) => t.toLowerCase()))
  return items[0].slice(0, folded.length)
}

/** A directory entry as listed: its name (a directory with a slash) and kind. */
interface FileEntry {
  name: string
  kind: CandidateKind
}

/** What an entry is: a directory (a link to one too, since it continues a path), a link, an executable, a file. */
function kindOf(full: string): CandidateKind {
  try {
    const st = fs.statSync(full)
    if (st.isDirectory()) return 'dir'
    if (fs.lstatSync(full).isSymbolicLink()) return 'link'
    return (st.mode & 0o111) !== 0 ? 'exec' : 'file'
  } catch {
    // A dangling link: listed, but there is nothing to continue into.
    return 'link'
  }
}

/** Which entries to list: every one (null), directories only, or files with these extensions first. */
type FileKinds = null | 'dirs' | readonly string[]

/**
 * Entries of `dir` starting with `stem`, as zsh offers them: dot files only
 * when `stem` starts with a dot, and ignoring case when nothing matches as
 * typed. With extensions, the files carrying one of them and the
 * directories, unless that leaves nothing.
 */
function fileEntries(dir: string, stem: string, kinds: FileKinds): FileEntry[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const visible = stem.startsWith('.') ? names : names.filter((n) => !n.startsWith('.'))
  let hits = visible.filter((n) => n.startsWith(stem))
  if (hits.length === 0) {
    const folded = stem.toLowerCase()
    hits = visible.filter((n) => n.toLowerCase().startsWith(folded))
  }
  const entries = hits.sort().map((n) => {
    const kind = kindOf(path.join(dir, n))
    // A trailing slash literally, not path.sep -- the console's paths are
    // written the way PyMOL writes them.
    return { name: kind === 'dir' ? `${n}/` : n, kind }
  })
  if (kinds === null) return entries
  if (kinds === 'dirs') return entries.filter((e) => e.kind === 'dir')
  const preferred = entries.filter((e) => e.kind === 'dir' || kinds.some((x) => hasExt(e.name, x)))
  return preferred.length > 0 ? preferred : entries
}

/**
 * A name as it can be typed in an argument: quoted when it holds what ends
 * one (`,` `;`) or would be trimmed (spaces at either end). Spaces inside
 * need nothing.
 */
function typeable(name: string): string {
  if (!/[,;]|^\s|\s$/.test(name)) return name
  return name.includes('"') ? `'${name}'` : `"${name}"`
}

/**
 * Filename completion, PyMOL's fallback for everything the catalogue does
 * not describe.
 */
function completeFilename(line: string, cc: CompletionContext, messages: ConsoleEntry[]): CompletionOutcome {
  const lastSep = Math.max(line.lastIndexOf(','), line.lastIndexOf('@'))
  const loc = lastSep >= 0 ? lastSep + 1 : line.indexOf(' ') + 1
  const pre = line.slice(0, loc)
  const typed = line.slice(loc).replace(/^\s+/, '')
  const group: Group = { heading: 'files', pattern: typed, regionStart: loc, offers: fileOffers(typed, cc.cwd, '', null), plain: true }
  return settle([group], () => pre, false, typed, messages)
}

/** A candidate as it is offered: its text, and what follows it once chosen. */
interface Offer {
  text: string
  /** Appended when this one is chosen alone. */
  sep: string
  /** As listed, when not `text` (a file's own name, not its path). */
  label?: string
  kind: CandidateKind
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
function fileOffers(typed: string, cwd: string, sep: string, kinds: FileKinds): Offer[] {
  if (typed.startsWith('$')) {
    return Object.keys(process.env)
      .filter((v) => v.startsWith(typed.slice(1)))
      .sort()
      .map((v) => ({ text: `$${v}`, sep: '', kind: 'variable' as const }))
  }
  // The stem is what follows the last slash as typed: resolving first would
  // turn `.` (a dot file to come) into the current directory's own name.
  const cut = Math.max(typed.lastIndexOf('/'), typed.lastIndexOf(path.sep)) + 1
  const stem = typed.slice(cut)
  // What was typed of the directory stays as typed: relative stays relative, `~` stays `~`.
  const typedDir = typed.slice(0, cut)
  const dir = resolvePath(cwd, typedDir === '' ? '.' : typedDir)
  return fileEntries(dir, stem, kinds).map((e) => ({
    text: typedDir + typeable(e.name),
    sep: e.kind === 'dir' ? '' : sep,
    label: e.name,
    kind: e.kind,
  }))
}

/** Which entries a `files` entry lists (ArgCompletion.files). */
function kindsOf(ctx: WorkerContext, entry: ArgCompletion | null): FileKinds {
  if (entry?.files === 'dirs') return 'dirs'
  if (entry?.files !== 'openable') return null
  try {
    return openableExtensions(ctx)
  } catch {
    // No stream manager (no app behind the worker): every file.
    return null
  }
}

/** The candidates of a group that the pattern selects. */
function matchesOf(g: Group): string[] {
  const texts = g.offers.map((o) => o.text)
  // Files are matched as they are listed (fileEntries), case retry included.
  if (g.plain) return texts
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
      items.map((it): Offer =>
        typeof it === 'string'
          ? { text: it, sep: sepFor('next'), kind: 'value' }
          : { text: it.text, sep: sepFor(it.then), kind: 'value' },
      )

    if (entry?.source === 'files') {
      groups.push({ heading: 'files', pattern: text, regionStart: current.valueStart, offers: fileOffers(text, cc.cwd, sepFor('next'), kindsOf(ctx, entry)), plain: true })
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
      groups.push({ heading: 'files', pattern: text, regionStart: current.valueStart, offers: fileOffers(text, cc.cwd, '', null), plain: true })
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
        offers: open.map((p): Offer => ({ text: `${p.name}=`, sep: '', kind: 'argument' })),
      })
    }
  }

  if (groups.length === 0) return null
  return settle(groups, (at) => prefixAt(line, at, spec.name), known, text, messages)
}

/**
 * The outcome of the groups the argument being typed can be from: one match
 * written in, several returned as candidates, none said.
 *
 * @param prefixOf - the line up to where a group's choice goes
 * @param known - whether the argument goes to a known parameter; then a
 *   lone parameter name is listed rather than written over an empty value
 */
function settle(
  groups: Group[],
  prefixOf: (at: number) => string,
  known: boolean,
  text: string,
  messages: ConsoleEntry[],
): CompletionOutcome {
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
    return { replacement: prefixOf(g.regionStart) + hits[0] + (offer?.sep ?? ''), messages }
  }

  // Several, by kind. Names starting with an underscore are internal --
  // not listed, and not holding the common prefix back.
  const candidates: CompletionCandidate[] = []
  const shown: string[] = []
  for (const { g, hits } of matched) {
    const head = prefixOf(g.regionStart)
    for (const h of hits) {
      if (h.startsWith('_')) continue
      const offer = g.offers.find((o) => o.text === h)
      candidates.push({ label: offer?.label ?? h, replacement: head + h + (offer?.sep ?? ''), kind: offer?.kind ?? 'value', group: g.heading })
      shown.push(h)
    }
  }
  // The line grows to what they share -- strictly longer than what was
  // typed, else it would look like a no-op -- when they replace the same part.
  const first = matched[0].g
  const samePart = matched.every((m) => m.g.regionStart === first.regionStart && m.g.pattern === first.pattern)
  const prefix = onlyName || !samePart ? '' : sharedPrefix(shown, first.pattern)
  return {
    replacement: prefix.length > first.pattern.length ? prefixOf(first.regionStart) + prefix : null,
    messages,
    candidates,
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
  if (!line.includes(' ') && !line.includes('@')) return completeCommand(line, names, messages)

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
