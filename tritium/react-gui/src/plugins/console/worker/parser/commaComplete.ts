/**
 * @file plugins/console/worker/parser/commaComplete.ts
 * @description Tab in the comma grammar (the native and PyMOL dialects).
 *
 * A port of `Parser._complete` and `complete_sc` (`modules/pymol/parser.py`),
 * including the regexes, the fallbacks and the printed wording, because the
 * point of the feature is that a PyMOL user's fingers already know it.
 *
 * The shape to keep in mind: completion takes the whole line and answers with
 * the whole line. It does not insert at the caret. PyMOL's own GUI then
 * replaces the field and drops the caret at the end, and so does ours.
 *
 * What belongs to the grammar is here: reading the partial line the way
 * execution reads it (`scanArgs`, `assignArgs`), and writing a choice back
 * -- `, ` after a value while parameters remain, `name=` for a parameter,
 * quoting what would end an argument. Listing, matching and settling the
 * candidates is the dialect-free engine (`completion/engine.ts`).
 *
 * With `fileFallback` (PyMOL's habit), anything the catalogue cannot answer
 * falls through to filenames, which is why `load <TAB>` works without `load`
 * declaring anything.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ConsoleEntry } from '../../shared/consoleTypes'
import { interpretShortcut } from './shortcut'
import { expandGlob, pathWord, refWord, splitPathWords } from '../runtime/paths'
import { assignArgs, nextPositional } from './bindArgs'
import type { ArgRule } from './bindArgs'
import { scanArgs } from './parseArgs'
import type { CompletionItem, ConsoleCommand } from '../runtime/types'
import { commonPrefix } from '@cuemol/console-kit'
import { complain, fileOffers, kindsOf, settle } from '../completion/engine'
import type { CompletionContext, CompletionOutcome, Group, Offer } from '../completion/engine'

/** The comma grammar's two variants of reading a line, as the dialect sets them. */
export interface CommaGrammar {
  /** How typed arguments are matched to parameters (`bindArgs.ts`). */
  rule: ArgRule
  /** PyMOL's habit: where a parameter has no values to offer, list files. */
  fileFallback: boolean
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
  const group: Group = { heading: 'files', pattern: typed, regionStart: loc, offers: fileOffers(typed, cc.cwd, '', null, typedPath), plain: true }
  return settle([group], () => pre, false, typed, messages)
}

/** A path written as one argument: the typed directory, then the name quoted if it must be. */
function typedPath(typedDir: string, name: string): string {
  return typedDir + typeable(name)
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
  grammar: CommaGrammar,
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
  const rule = grammar.rule
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

    if (entry?.list) {
      // A list, as zsh reads a command line: the last word is the one Tab
      // works on, and a pattern there expands in place.
      const words = splitPathWords(text)
      const tail = words.at(-1)
      const word = tail && tail.start + tail.raw.length === text.length ? tail : null
      const at = current.valueStart + (word?.start ?? text.length)
      const sc = { sceneId: cc.sceneId, viewId: cc.viewId, cwd: cc.cwd, bound, pattern: word?.pattern ?? '' }
      const expanded = !word ? null
        : entry.source === 'files' ? (word.glob ? expandGlob(cc.cwd, word.pattern).map(pathWord) : null)
        : (cc.dialect.expand?.(entry.source, ctx, sc) ?? null)
      if (expanded !== null && word) {
        if (expanded.length === 0) {
          complain(messages, ` parser: no matches found: ${word.raw}`)
          return { replacement: null, messages }
        }
        return { replacement: `${prefixAt(line, at, spec.name)}${expanded.join(' ')} `, messages }
      }
      const typed = word?.value ?? ''
      if (entry.source === 'files') {
        const offers = fileOffers(typed, cc.cwd, ' ', kindsOf(ctx, entry), (d, n) => pathWord(d + n))
        groups.push({ heading: 'files', pattern: word?.raw ?? '', regionStart: at, offers, plain: true })
      } else {
        const items = cc.dialect.candidates(entry.source, ctx, { ...sc, pattern: typed }) ?? []
        const offers = items.map((it): Offer => {
          const item = typeof it === 'string' ? { text: it, then: 'next' as const } : it
          return { text: refWord(item.text), sep: item.then === 'continue' ? '' : ' ', kind: 'value' }
        })
        groups.push({ heading: entry.description, pattern: word?.raw ?? '', regionStart: at, offers })
      }
    } else if (entry?.source === 'files') {
      groups.push({ heading: 'files', pattern: text, regionStart: current.valueStart, offers: fileOffers(text, cc.cwd, sepFor('next'), kindsOf(ctx, entry), typedPath), plain: true })
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
    if (valuesDeclined && grammar.fileFallback) {
      // PyMOL's own fallback: a file name is left as typed, nothing after it.
      groups.push({ heading: 'files', pattern: text, regionStart: current.valueStart, offers: fileOffers(text, cc.cwd, '', null, typedPath), plain: true })
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
 * Complete one command line.
 *
 * @param line - the line as typed, without a trailing newline.
 * @returns the rewritten line and whatever should be printed.
 */
export function completeLine(
  ctx: WorkerContext,
  line: string,
  cc: CompletionContext,
  grammar: CommaGrammar,
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
    const done = completeArgument(ctx, line, spec, cc, grammar, messages)
    if (done) return done
  }
  if (!grammar.fileFallback && spec) {
    complain(messages, ' parser: nothing to complete here.')
    return { replacement: null, messages }
  }
  return completeFilename(line, cc, messages)
}
