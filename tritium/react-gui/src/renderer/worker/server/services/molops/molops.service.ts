/**
 * @file worker/server/services/molops/molops.service.ts
 * @description Editing molecules: the registry entry.
 *
 * Operations that change a molecule rather than how it is drawn -- merging,
 * superposing, deleting atoms, renaming chains, building surfaces and
 * symmetry copies.
 */

import { analyzeInteractions } from './analyzeInteractions';
import { changeChainName } from './changeChainName';
import { changeResidueIndex } from './changeResidueIndex';
import { createSymmMol, getCreateSymmMolOptions } from './createSymmMol';
import { cutSurfByPlane } from './cutSurfByPlane';
import { deleteMolAtoms } from './deleteMolAtoms';
import { makeMolSurf, proposeMolSurfName } from './makeMolSurf';
import { mergeMol } from './mergeMol';
import { reassignProt2ndry } from './reassignProt2ndry';
import { getMolSurfRegenInfo, regenMolSurf } from './regenMolSurf';
import { superposeMol } from './superposeMol';
import { changeSymmetryInfo, getSpaceGroupNames, getSymmetryPanelInfo, showSymmRenderer, showUnitCellRenderer } from './symmetryPanelOps';

export const services = {
    analyzeInteractions,
    changeChainName,
    changeResidueIndex,
    getCreateSymmMolOptions,
    createSymmMol,
    cutSurfByPlane,
    deleteMolAtoms,
    makeMolSurf,
    proposeMolSurfName,
    mergeMol,
    reassignProt2ndry,
    getMolSurfRegenInfo,
    regenMolSurf,
    superposeMol,
    getSymmetryPanelInfo,
    getSpaceGroupNames,
    changeSymmetryInfo,
    showSymmRenderer,
    showUnitCellRenderer,
};

export type * from './analyzeInteractions';
export type * from './changeChainName';
export type * from './changeResidueIndex';
export type * from './createSymmMol';
export type * from './cutSurfByPlane';
export type * from './deleteMolAtoms';
export type * from './makeMolSurf';
export type * from './mergeMol';
export type * from './reassignProt2ndry';
export type * from './regenMolSurf';
export type * from './superposeMol';
export type * from './symmetryPanelOps';
