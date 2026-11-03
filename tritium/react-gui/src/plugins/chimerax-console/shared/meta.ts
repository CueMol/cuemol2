/**
 * @file plugins/chimerax-console/shared/meta.ts
 * @description What the ChimeraX dialect (ChX console) says about itself to the console.
 *
 * Declared to the renderer under the console's `console.dialect` extension
 * point (`index.ts`) and carried by the worker's dialect (`worker/index.ts`).
 */

import type { DialectMeta } from '@plugins/console/shared/dialectMeta'

export const CHIMERAX_META: DialectMeta = {
  id: 'chimerax',
  label: 'ChimeraX',
  prompt: 'ChX>',
  txnPrefix: 'chx: ',
  actionSource: 'chx',
  historyKey: 'cuemol.console.history.chimerax',
  scripts: [{ ext: '.cxc', submit: 'text' }],
  cliColor: 'green',
}
