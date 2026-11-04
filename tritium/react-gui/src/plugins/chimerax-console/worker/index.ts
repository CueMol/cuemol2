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

import type { BindScene, ConsoleCommand, ConsoleDialect, DialectSyntax } from '@plugins/console/worker/dialect-api'
import { CHIMERAX_META } from '../shared/meta'
import { isChxCommand } from './cli/command'
import { completeChx } from './cli/complete'
import { bindLine, splitLines } from './cli/syntax'
import { resolveChx } from './commands/aliasCommands'
import { withSceneSelectors } from './spec/selectors'
import { selectionNames } from './names'
import { CHX_COMMANDS } from './commands/registry'

/** ChimeraX's command language (cli.py), as a console syntax. */
const CHX_SYNTAX: DialectSyntax = {
  split: splitLines,
  resolve(text: string, commands: readonly ConsoleCommand[]) {
    // An alias is looked up here, line by line as the lines run (`aliasCommands.ts`).
    const r = resolveChx(text, commands.filter(isChxCommand))
    return 'error' in r ? { kind: 'error', error: r.error } : { kind: 'found', spec: r.spec }
  },
  bind(spec: ConsoleCommand, text: string, scene?: BindScene) {
    if (!isChxCommand(spec)) return { kind: 'error', error: `Error: ${spec.name} is not a ChimeraX command` }
    // The scene's named selections are selectors while the line is read.
    if (!scene) return bindLine(spec, text)
    return withSceneSelectors(selectionNames(scene.ctx, scene.sceneId), () => bindLine(spec, text))
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
