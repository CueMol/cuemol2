/**
 * @file plugins/pymol-console/worker/index.ts
 * @description The PyMOL dialect: the part of PyMOL's command language the
 * console speaks.
 *
 * Its commands are written by hand in PyMOL's terms -- PyMOL's names and
 * parameters, PyMOL selections translated into CueMol ones (`sel/`), the
 * `pym:<rep>` renderer convention, PyMOL's setting names. All of that stays in
 * this plugin, which reaches the console only through
 * `@plugins/console/worker/dialect-api`; the console never imports from here.
 */

import type { ConsoleDialect } from '@plugins/console/worker/dialect-api'
import { PYMOL_META } from '../shared/meta'
import { commaSyntax } from '@plugins/console/worker/dialect-api'
import { commandNames, PYM_COMMANDS } from './commands/registry'
import { candidatesFor } from './sources'
import type { CompletionSourceId } from './sources'

export const PYMOL_DIALECT: ConsoleDialect = {
  meta: PYMOL_META,
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
