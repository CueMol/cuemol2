/**
 * @file plugins/sequence/worker/seq.service.ts
 * @description The Sequence panel's worker services: the registry entry.
 *
 * Found by the plugin glob in `worker/server/services/index.ts` and
 * registered under `plugin.sequence.<name>`, which is why these names are
 * absent from `ServiceMap`. The renderer half calls them through the typed
 * client in `../calls.ts`.
 */

import { getSeqPanelData } from './getSeqPanelData';
import { centerOnResidue, rangeSelectResidues, toggleResidueSelection } from './seqPanelOps';

export const services = {
    getSeqPanelData,
    toggleResidueSelection,
    rangeSelectResidues,
    centerOnResidue,
};

export type * from './getSeqPanelData';
export type * from './seqPanelOps';
