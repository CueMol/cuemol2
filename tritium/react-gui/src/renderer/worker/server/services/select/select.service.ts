/**
 * @file worker/server/services/select/select.service.ts
 * @description Selections: the registry entry.
 *
 * Compiling a selection string, applying one from the sequence panel or a
 * rubber band, counting what it hits, and the named definitions the user
 * can save and reuse.
 */

import { applyMolSelString, centerMolSelection, zoomMolSelection } from './applyMolSelString';
import { getMolAtoms, getMolChains, getMolResidues } from './getMolStructure';
import { getSelDefs } from './getSelDefs';
import { getSelHitCount } from './getSelHitCount';
import { getSeqPanelData } from './getSeqPanelData';
import { lassoSelect } from './lassoSelect';
import { rectSelect } from './rectSelect';
import { saveSelDef } from './saveSelDef';
import { selectObjectMol } from './selectObjectMol';
import { centerOnResidue, rangeSelectResidues, toggleResidueSelection } from './seqPanelOps';
import { validateSelection } from './validateSelection';

export const services = {
    applyMolSelString,
    centerMolSelection,
    zoomMolSelection,
    getMolChains,
    getMolResidues,
    getMolAtoms,
    getSelDefs,
    getSelHitCount,
    getSeqPanelData,
    lassoSelect,
    rectSelect,
    saveSelDef,
    selectObjectMol,
    toggleResidueSelection,
    rangeSelectResidues,
    centerOnResidue,
    validateSelection,
};

export type * from './applyMolSelString';
export type * from './getMolStructure';
export type * from './getSelDefs';
export type * from './getSelHitCount';
export type * from './getSeqPanelData';
export type * from './lassoSelect';
export type * from './rectSelect';
export type * from './saveSelDef';
export type * from './selectObjectMol';
export type * from './seqPanelOps';
export type * from './validateSelection';
