/**
 * @file plugins/console/worker/completion/engine.ts
 * @description What Tab does, apart from any dialect's grammar.
 *
 * The candidates an argument can take, matched against what was typed and
 * settled into one of three outcomes:
 *
 * - one candidate -> the line is rewritten with it, plus what follows it;
 * - several -> they are returned as candidates, each with the line it
 *   stands for, for the client to list and walk as zsh does
 *   (@cuemol/console-kit completion.ts); the line is extended to their common
 *   prefix, but only if that is strictly longer than what was typed;
 * - none -> a line saying so, and the line is left alone.
 *
 * How a line is read, and how a choice is written back into it (separators,
 * quoting, `name=`), is the dialect's (`DialectSyntax.complete`): the comma
 * grammar's is `parser/commaComplete.ts`. This file only lists, matches and
 * settles.
 *
 * File names follow zsh: dot files only when a dot is typed, a
 * case-insensitive retry when nothing matches as typed, for a load the files
 * it opens first, for `cd` directories only (ArgCompletion.files).
 */

import * as fs from 'fs'
import * as path from 'path'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ConsoleEntry } from '../../shared/consoleTypes'
import { interpretShortcut } from '../parser/shortcut'
import { resolvePath } from '../runtime/paths'
import type { ArgCompletion, ConsoleDialect } from '../runtime/types'
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

export function complain(messages: ConsoleEntry[], text: string): void {
  messages.push({ kind: 'warning', text })
}

/**
 * The longest prefix `items` share. When they matched `pattern` only
 * ignoring case (fileEntries' retry), case is ignored here too and the
 * first item's spelling is taken.
 */
export function sharedPrefix(items: readonly string[], pattern: string): string {
  if (items.every((t) => t.startsWith(pattern))) return commonPrefix(items)
  const folded = commonPrefix(items.map((t) => t.toLowerCase()))
  return items[0].slice(0, folded.length)
}

/** A directory entry as listed: its name (a directory with a slash) and kind. */
export interface FileEntry {
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
export type FileKinds = null | 'dirs' | readonly string[]

/**
 * Entries of `dir` starting with `stem`, as zsh offers them: dot files only
 * when `stem` starts with a dot, and ignoring case when nothing matches as
 * typed. With extensions, the files carrying one of them and the
 * directories, unless that leaves nothing.
 */
export function fileEntries(dir: string, stem: string, kinds: FileKinds): FileEntry[] {
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

/** A candidate as it is offered: its text, and what follows it once chosen. */
export interface Offer {
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
export interface Group {
  heading: string
  pattern: string
  regionStart: number
  offers: Offer[]
  /** Match by plain prefix (file names), not PyMOL's abbreviations. */
  plain?: boolean
}

/**
 * Files under the typed path; a directory continues the path.
 *
 * @param write - how a path is written back, in the dialect's grammar
 */
export function fileOffers(
  typed: string,
  cwd: string,
  sep: string,
  kinds: FileKinds,
  write: (typedDir: string, name: string) => string,
): Offer[] {
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
    text: write(typedDir, e.name),
    sep: e.kind === 'dir' ? '' : sep,
    label: e.name,
    kind: e.kind,
  }))
}

/** Which entries a `files` entry lists (ArgCompletion.files). */
export function kindsOf(ctx: WorkerContext, entry: ArgCompletion | null): FileKinds {
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
export function matchesOf(g: Group): string[] {
  const texts = g.offers.map((o) => o.text)
  // Files are matched as they are listed (fileEntries), case retry included.
  if (g.plain) return texts
  const found = interpretShortcut(g.pattern, texts, { prefixSearchOnExact: false })
  return found.kind === 'found' ? [found.name] : found.kind === 'ambiguous' ? found.candidates : []
}

/**
 * The outcome of the groups the argument being typed can be from: one match
 * written in, several returned as candidates, none said.
 *
 * @param prefixOf - the line up to where a group's choice goes
 * @param known - whether the argument goes to a known parameter; then a
 *   lone parameter name is listed rather than written over an empty value
 */
export function settle(
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

