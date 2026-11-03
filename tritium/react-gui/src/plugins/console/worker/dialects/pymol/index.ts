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
import { metaOf } from '@plugins/console/shared/dialectMeta'
import { commaSyntax } from '@plugins/console/worker/parser/commaSyntax'
import { commandNames, PYM_COMMANDS } from './commands/registry'
import { candidatesFor } from './sources'
import type { CompletionSourceId } from './sources'

export const PYMOL_DIALECT: ConsoleDialect = {
  meta: metaOf('pymol'),
  // The comma grammar with PyMOL's own matching, which its scripts rely on;
  // Tab lists files wherever it has nothing better, as PyMOL does.
  syntax: commaSyntax({
    rule: 'pymol',
    fileFallback: true,
    pythonRefusal: 'Error: Python expressions are not available in this console',
  }),
  commands: () => PYM_COMMANDS,
  // PyMOL runs these through `run`, and warns when they are given to `@`.
  refuseScript: (filePath) => {
    if (/\.(py|pym)$/i.test(filePath)) return `Error: ${filePath} is a Python script; Python is not available in this console`
    return null
  },
  candidates: (id, ctx, sc) => candidatesFor(id as CompletionSourceId, ctx, sc, commandNames()),
}
