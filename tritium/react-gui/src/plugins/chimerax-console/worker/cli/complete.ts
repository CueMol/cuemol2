/**
 * @file plugins/chimerax-console/worker/cli/complete.ts
 * @description Tab in the ChX console, written back in ChimeraX's grammar.
 *
 * The word before the caret is completed against what can stand there: a
 * command name (first word), else the command's keywords and the values its
 * arguments take (enum values, colour and selector names, files for a file
 * name). A chosen value is followed by a space -- ChimeraX separates
 * arguments by spaces and writes a keyword as a word, never `name=` or
 * `, `. A file name with a space in it is quoted.
 *
 * Listing, matching and settling are the dialect-free engine's
 * (`completion/engine.ts`).
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { complain, fileOffers, settle } from '@plugins/console/worker/dialect-api'
import type { CompletionContext, CompletionOutcome, Group, Offer } from '@plugins/console/worker/dialect-api'
import { isChxCommand } from './command'
import type { ChxArg, ChxCommand } from './command'
import { keywordArgs, matchKeyword, resolveWords } from './syntax'

/** A file name as typed in a ChimeraX argument: quoted when it holds a space. */
function quotedPath(typedDir: string, name: string): string {
  const p = typedDir + name
  if (!/\s/.test(p)) return p
  return p.includes('"') ? `'${p}'` : `"${p}"`
}

/** Offers that start with `pattern`, ignoring case, each followed by a space. */
function startingWith(texts: readonly string[], pattern: string, kind: Offer['kind']): Offer[] {
  const p = pattern.toLowerCase()
  return [...new Set(texts)].filter((t) => t.toLowerCase().startsWith(p)).map((text) => ({ text, sep: ' ', kind }))
}

/** Tab on a ChX console line. */
export function completeChx(_ctx: WorkerContext, line: string, cc: CompletionContext): CompletionOutcome {
  const messages: CompletionOutcome['messages'] = []
  const commands = cc.dialect.commands().filter(isChxCommand)
  // The word being typed starts after the last space (a quoted path keeps its own).
  const at = line.lastIndexOf(' ') + 1
  const pattern = line.slice(at)
  const prefixOf = (n: number) => line.slice(0, n)

  if (!/\s/.test(line.trimStart())) {
    const offers = startingWith(commands.map((c) => c.words[0]), pattern.trimStart(), 'command')
    const start = line.length - pattern.trimStart().length
    return settle([{ heading: 'commands', pattern: pattern.trimStart(), regionStart: start, offers }], prefixOf, false, pattern, messages)
  }

  const r = resolveWords(line, commands)
  if ('error' in r) {
    complain(messages, ` ${r.error.replace(/^Error: /, '')}`)
    return { replacement: null, messages }
  }
  const spec: ChxCommand = r.spec
  const groups: Group[] = []
  // The word before this one, when it is a keyword: then only its values.
  const before = line.slice(0, at).trim().split(/\s+/).pop() ?? ''
  const kwNames = keywordArgs(spec).map((a) => a.name)
  const prevKw = matchKeyword(before, kwNames)
  const valueOf: ChxArg | undefined =
    typeof prevKw === 'string' ? spec.args.find((a) => a.name === prevKw) : undefined
  const args = valueOf ? [valueOf] : spec.args

  const values = args.flatMap((a) => a.type.values?.() ?? [])
  if (values.length > 0) groups.push({ heading: 'values', pattern, regionStart: at, offers: startingWith(values, pattern, 'value') })
  if (!valueOf) groups.push({ heading: 'keywords', pattern, regionStart: at, offers: startingWith(kwNames, pattern, 'argument') })
  if (args.some((a) => a.type.isPath)) {
    groups.push({ heading: 'files', pattern, regionStart: at, offers: fileOffers(pattern.replace(/^["']/, ''), cc.cwd, ' ', null, quotedPath), plain: true })
  }
  if (groups.every((g) => g.offers.length === 0)) {
    complain(messages, ' nothing to complete here.')
    return { replacement: null, messages }
  }
  return settle(groups.filter((g) => g.offers.length > 0), prefixOf, true, pattern, messages)
}
