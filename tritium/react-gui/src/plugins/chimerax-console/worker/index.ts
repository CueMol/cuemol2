/**
 * @file plugins/chimerax-console/worker/index.ts
 * @description The ChX console: ChimeraX's command language, translated into CueMol ops.
 *
 * A partial ChimeraX dialect. Its lines are read the way ChimeraX reads
 * them (`cli/`: prefix command names, space-separated arguments, keywords),
 * its atom specifications are translated per molecule (`spec/`), and each
 * command runs as op catalog ops through `invokeOp` (`display.ts`), the
 * same operations MCP, the agent and the native console use. What it shows
 * is held in the scene, in renderers named `chx:`.
 *
 * Self-contained: a plugin of its own (`chimerax-console`) that reaches the
 * console only through `@plugins/console/worker/dialect-api`, and imports
 * neither the native nor the PyMOL dialect. Removing it is this plugin's
 * directory and its line in `plugins/index.ts`.
 */

import type { ConsoleCommand, ConsoleDialect, DialectSyntax } from '@plugins/console/worker/dialect-api'
import { CHIMERAX_META } from '../shared/meta'
import { isChxCommand } from './cli/command'
import { completeChx } from './cli/complete'
import { bindLine, resolveWords, splitLines } from './cli/syntax'
import { CHX_COMMANDS } from './commands/registry'

/** ChimeraX's command language (cli.py), as a console syntax. */
const CHX_SYNTAX: DialectSyntax = {
  split: splitLines,
  resolve(text: string, commands: readonly ConsoleCommand[]) {
    const r = resolveWords(text, commands.filter(isChxCommand))
    return 'error' in r ? { kind: 'error', error: r.error } : { kind: 'found', spec: r.spec }
  },
  bind(spec: ConsoleCommand, text: string) {
    if (!isChxCommand(spec)) return { kind: 'error', error: `Error: ${spec.name} is not a ChimeraX command` }
    return bindLine(spec, text)
  },
  complete: completeChx,
}

export const CHIMERAX_DIALECT: ConsoleDialect = {
  meta: CHIMERAX_META,
  syntax: CHX_SYNTAX,
  commands: () => CHX_COMMANDS,
  refuseScript: (filePath) => {
    if (/\.py$/i.test(filePath)) return `Error: ${filePath} is a Python script, which this console does not run`
    return null
  },
  // Sources are declared on the argument types (cli/argTypes.ts), not by id.
  candidates: () => null,
}
