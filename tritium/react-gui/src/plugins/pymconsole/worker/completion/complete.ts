/**
 * @file plugins/pymconsole/worker/completion/complete.ts
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
import { commandNames, findCommand } from '../commands/registry'
import { resolvePath } from '../commands/helpers'
import { commonPrefix, formatColumns } from './columns'
import { candidatesFor } from './sources'
import type { CompletionSourceId, SourceContext } from './sources'

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
}

/** PyMOL masks bracketed lists before counting commas -- and nothing else. */
const LIST_RE = /\[[^\]]*\]/g

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
  const names = commandNames()

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
  if (resolved.kind === 'found') {
    const spec = findCommand(resolved.name)
    // Brackets are masked; parentheses and quotes are not. That is PyMOL's
    // rule, kept so a line that counts as argument 2 there counts as argument
    // 2 here.
    const index = (line.replace(LIST_RE, '').match(/,/g) ?? []).length
    const entry = spec?.completions?.[index] ?? null
    if (spec && entry) {
      const pattern = line.replace(/.*[, ]/, '')
      const sc: SourceContext = {
        sceneId: cc.sceneId,
        viewId: cc.viewId,
        argsSoFar: argumentsBefore(line, index),
      }
      const candidates = candidatesFor(entry.source as CompletionSourceId, ctx, sc, names)
      if (candidates !== null) {
        const result = completeAgainst(
          pattern,
          candidates,
          entry.description,
          entry.suffix,
          messages,
          false,
        )
        return {
          replacement: result === null ? null : rebuildPrefix(line, resolved.name) + result,
          messages,
        }
      }
    }
  }

  return completeFilename(line, cc, messages)
}

/**
 * Everything before the argument being completed, split on commas.
 *
 * Only `settingValue` needs it, to know which property is being set.
 */
function argumentsBefore(line: string, index: number): string[] {
  const afterCommand = line.replace(/^[^ ]* /, '')
  return afterCommand
    .split(',')
    .slice(0, index)
    .map((s) => s.trim())
}

/**
 * The part of the line the completion is appended to.
 *
 * PyMOL rewrites the typed abbreviation to the full command name and
 * normalises the spacing after the last comma to exactly `", "`, so a line
 * completed twice does not accumulate whitespace.
 */
function rebuildPrefix(line: string, commandName: string): string {
  let pre = line.replace(/^[^ ]* /, ' ')
  if (pre.includes(',')) {
    pre = pre.replace(/[^, ]*$/, '')
    pre = pre.replace(/,\s*$/, ', ')
  } else {
    pre = pre.replace(/[^ ]*$/, '')
  }
  pre = pre.replace(/^ */, '')
  return `${commandName} ${pre}`
}
