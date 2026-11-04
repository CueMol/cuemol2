/**
 * @file plugins/chimerax-console/worker/commands/aliasCommands.ts
 * @description `alias`, `alias list`, `alias delete`, `~alias`, and calling an alias.
 *
 * ChimeraX keeps aliases for the session (`std_commands/src/alias.py`); here
 * they live in the worker for the app's life, shared by every scene.
 *
 * - A definition takes the rest of the line, `;` included
 *   (`WholeRestOfLine`): `splitLines` does not split a line that starts with
 *   `alias`, so `alias rc cartoon; color red` defines two commands and runs
 *   neither.
 * - A call is looked up when the line is about to run (`resolve`, which the
 *   runtime calls line by line), never when the text is split, so a script
 *   can define an alias and use it on the next line. The call expands `$1`
 *   to `$9` and `$*`, splits the result, and runs each command in the same
 *   transaction. An alias does not expand itself again inside its own text.
 * - A command that has to run outside the transaction (`save x.qsc`,
 *   `open x.qsc`, `undo`) is refused before anything in the alias runs:
 *   called from inside one, it would run in the transaction the runtime
 *   keeps it out of.
 */

import type { CmdOutcome, CmdContext, ConsoleCommand } from '@plugins/console/worker/dialect-api'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { RestOfLine, StringArg } from '../cli/argTypes'
import { chxCommand, isChxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { bindLine, resolveWords, splitLines } from '../cli/syntax'
import { nextToken } from '../cli/tokens'
import { withSceneSelectors } from '../spec/selectors'
import { selectionNames } from '../names'

/** The aliases, by name. */
const aliases = new Map<string, string>()
/** The aliases being expanded now, so one does not expand itself. */
const expanding: string[] = []
/** Deepest alias-in-alias expansion, against a loop through several aliases. */
const MAX_DEPTH = 10

/** The command list, which is made after these commands (`registry.ts`). */
let allCommands: () => readonly ConsoleCommand[] = () => []

/** Give the alias caller the command list (`registry.ts`). */
export function setAliasCommandList(list: () => readonly ConsoleCommand[]): void {
  allCommands = list
}

/** Forget every alias (tests). */
export function clearAliases(): void {
  aliases.clear()
}

/** `$1`-`$9` and `$*` in an alias's text, from the words it was called with. */
export function expandAlias(text: string, rest: string): string {
  const words: string[] = []
  for (let t = nextToken(rest); t; t = nextToken(t.rest)) words.push(t.value)
  return text.replace(/\$(\*|[1-9])/g, (_m, k: string) => (k === '*' ? rest.trim() : words[Number(k) - 1] ?? ''))
}

/** Read and bind one line in the scene, as the runtime does. */
function readLine(ctx: WorkerContext, cc: CmdContext, text: string): { spec: ChxCommand; args: Record<string, string> } | { error: string } {
  const resolved = resolveChx(text, allCommands().filter(isChxCommand))
  if ('error' in resolved) return resolved
  const bound = withSceneSelectors(selectionNames(ctx, cc.sceneId), () => bindLine(resolved.spec, text))
  if (bound.kind === 'error') return { error: bound.error }
  if (bound.kind === 'usage') return { error: `Error: ${resolved.spec.name}: usage is not available inside an alias` }
  return { spec: resolved.spec, args: bound.args }
}

/** The command that calls alias `name`. */
function aliasCaller(name: string): ChxCommand {
  return chxCommand({
    words: [name],
    args: [{ name: 'rest', type: RestOfLine, role: 'optional' }],
    // The commands it runs say whether anything changed (their ops mark it).
    mutates: false,
    summary: `The alias "${name}".`,
    async run(ctx, args, cc): Promise<CmdOutcome> {
      if (expanding.length >= MAX_DEPTH) return { ok: false, error: `Error: ${name}: aliases nested too deeply` }
      const text = expandAlias(aliases.get(name) ?? '', args.rest)
      expanding.push(name)
      try {
        const lines = splitLines(text)
        // Refuse a command that must run outside the transaction, before anything runs.
        for (const line of lines) {
          const read = readLine(ctx, cc, line.text)
          if ('error' in read) continue
          if (read.spec.undoStack || read.spec.outsideTxn?.(read.args)) {
            return { ok: false, error: `Error: alias ${name}: ${read.spec.name} cannot run inside an alias; run it on its own line` }
          }
        }
        for (const line of lines) {
          // Bound again just before it runs: an earlier command may have named a selection.
          const read = readLine(ctx, cc, line.text)
          if ('error' in read) return { ok: false, error: read.error }
          const outcome = await read.spec.run(ctx, read.args, cc)
          if (!outcome.ok) return outcome
        }
        return { ok: true }
      } finally {
        expanding.pop()
      }
    },
  })
}

/**
 * The command `text` names: an alias when its first word is one (and is not
 * being expanded already), else the registered command.
 */
export function resolveChx(
  text: string,
  commands: readonly ChxCommand[],
): { spec: ChxCommand; taken: number } | { error: string } {
  const first = text.trim().split(/\s+/)[0] ?? ''
  if (aliases.has(first) && !expanding.includes(first)) return { spec: aliasCaller(first), taken: 1 }
  return resolveWords(text, commands)
}

const alias = chxCommand({
  words: ['alias'],
  args: [
    { name: 'name', type: StringArg, role: 'optional' },
    { name: 'text', type: RestOfLine, role: 'optional' },
  ],
  mutates: false,
  summary: 'Define a command name standing for other commands ($1-$9, $* for its words); alone, list them.',
  run(_ctx, args, cc) {
    if (args.name === '') {
      for (const [n, t] of [...aliases].sort()) cc.print(`${n}: ${t}`)
      return { ok: true }
    }
    if (args.text === '') {
      const t = aliases.get(args.name)
      if (t === undefined) return { ok: false, error: `Error: no alias named "${args.name}"` }
      cc.print(`${args.name}: ${t}`)
      return { ok: true }
    }
    aliases.set(args.name, args.text)
    return { ok: true }
  },
})

const aliasList = chxCommand({
  words: ['alias', 'list'],
  args: [{ name: 'internal', type: StringArg, role: 'keyword', ignored: true }],
  mutates: false,
  summary: 'List the aliases.',
  run(_ctx, _args, cc) {
    const names = [...aliases.keys()].sort()
    cc.print(names.length === 0 ? 'No aliases.' : `${names.length} aliases: ${names.join(', ')}`)
    return { ok: true }
  },
})

/** `alias delete` and `~alias`: forget one alias, or all of them. */
function aliasDelete(words: string[]): ChxCommand {
  return chxCommand({
    words,
    args: [{ name: 'name', type: StringArg, role: 'required' }],
    mutates: false,
    summary: 'Forget an alias, or all of them.',
    run(_ctx, args) {
      if (args.name === 'all') aliases.clear()
      else if (!aliases.delete(args.name)) return { ok: false, error: `Error: no alias named "${args.name}"` }
      return { ok: true }
    },
  })
}

export const ALIAS_COMMANDS: Record<string, ChxCommand> = {
  alias,
  aliasList,
  aliasDelete: aliasDelete(['alias', 'delete']),
  unalias: aliasDelete(['~alias']),
}
