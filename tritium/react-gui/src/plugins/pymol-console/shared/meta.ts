/**
 * @file plugins/pymol-console/shared/meta.ts
 * @description What the PyMOL dialect says about itself to the console.
 *
 * Declared to the renderer under the console's `console.dialect` extension
 * point (`index.ts`) and carried by the worker's dialect (`worker/index.ts`).
 * The values are the ones the dialect had inside the console, so a user's
 * history and the action log's source carry over.
 */

import type { DialectMeta } from '@plugins/console/shared/dialectMeta'

export const PYMOL_META: DialectMeta = {
  id: 'pymol',
  label: 'PyMOL',
  prompt: 'PyM>',
  txnPrefix: 'pym: ',
  actionSource: 'pym',
  // The key it had before the console spoke more than one language.
  historyKey: 'cuemol.pymconsole.history',
  scripts: [{ ext: '.pml', submit: 'text' }],
  cliColor: 'magenta',
}
