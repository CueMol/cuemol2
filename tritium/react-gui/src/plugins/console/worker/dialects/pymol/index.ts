/**
 * @file plugins/console/worker/dialects/pymol/index.ts
 * @description The PyMOL dialect: the part of PyMOL's command language the
 * console speaks.
 *
 * Its commands are written by hand in PyMOL's terms -- PyMOL's names and
 * parameters, PyMOL selections translated into CueMol ones (`sel/`), the
 * `pym:<rep>` renderer convention, PyMOL's setting names. All of that stays in
 * this directory: the runtime and the native dialect never import from here.
 */

import type { ConsoleDialect } from '@plugins/console/worker/runtime/types'
import { DIALECT_PROMPTS } from '@plugins/console/shared/consoleTypes'
import { commandNames, PYM_COMMANDS } from './commands/registry'
import { candidatesFor } from './sources'
import type { CompletionSourceId } from './sources'

export const PYMOL_DIALECT: ConsoleDialect = {
  id: 'pymol',
  prompt: DIALECT_PROMPTS.pymol,
  // PyMOL's own matching, which its scripts rely on.
  argRule: 'pymol',
  // PyMOL lists files wherever it has nothing better.
  fileFallback: true,
  txnPrefix: 'pym: ',
  commands: () => PYM_COMMANDS,
  refuseLine: (cmd) =>
    cmd.python ? 'Error: Python expressions are not available in this console' : null,
  // PyMOL runs these through `run`, and warns when they are given to `@`.
  refuseScript: (filePath) =>
    /\.(py|pym)$/i.test(filePath)
      ? `Error: ${filePath} is a Python script; Python is not available in this console`
      : null,
  candidates: (id, ctx, sc) => candidatesFor(id as CompletionSourceId, ctx, sc, commandNames()),
}
