// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Scene-tree object Selection submenu. Mirrors UXP
// `workspace_panel_molsel.js` `selectMol` / `invertMolSel` / `toggleSideCh`
// / `aroundMolSel`. Selection-string transforms are shared with
// `naviCtxtMenu.service.ts` via `helpers/selStrTransforms`.
//
// Split out of `sceneOps.service.ts`: molecular selection is a distinct
// concern from the node lifecycle / query operations that remain there.

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '../types/WorkerContext';
import type { SelectMolKind } from '../../../../shared/ipcTypes';
import { makeSel } from './helpers/makeSel';
import { invertSelStr, rewriteAround, toggleSidechainStr } from './helpers/selStrTransforms';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';
import { safeRead } from './helpers/safeRead';

export interface SelectObjectMolArgs {
    sceneId: number;
    objId: number;
    kind: SelectMolKind;
}

export interface SelectObjectMolResult {
    ok: boolean;
}


function autoCreateSelRend(mol: MolCoord): void {
    if (!mol.getRendererByType('*selection')) {
        mol.createRenderer('*selection');
    }
}

function applyMolSelStr(
    ctx: WorkerContext,
    mol: MolCoord,
    selStr: string,
    sceneUid: number,
): void {
    autoCreateSelRend(mol);
    const sel = makeSel(ctx, selStr, sceneUid);
    if (sel === null) return;
    mol.sel = sel;
}

const AROUND_KIND_DIST: Record<string, { dist: number; byres: boolean }> = {
    around3: { dist: 3, byres: false },
    around5: { dist: 5, byres: false },
    around7: { dist: 7, byres: false },
    around10: { dist: 10, byres: false },
    aroundByres3: { dist: 3, byres: true },
    aroundByres5: { dist: 5, byres: true },
    aroundByres7: { dist: 7, byres: true },
    aroundByres10: { dist: 10, byres: true },
};

function resolveSelStr(
    kind: SelectMolKind,
    prevSelStr: string,
): { selStr: string; label: string } | null {
    switch (kind) {
        case 'all':
            return { selStr: '*', label: 'Select all atoms' };
        case 'unselect':
            return { selStr: '', label: 'Unselect molecule' };
        case 'invert':
            return { selStr: invertSelStr(prevSelStr), label: 'Invert mol selection' };
        case 'protein':
            return { selStr: 'protein', label: 'Select protein' };
        case 'nucleic':
            return { selStr: 'nucleic', label: 'Select nucleic' };
        case 'water':
            return { selStr: 'water', label: 'Select water' };
        case 'sugar':
            return { selStr: 'sugar', label: 'Select sugar' };
        case 'hydrogen':
            return { selStr: 'elem H', label: 'Select hydrogen' };
        case 'sidechain':
            // sidechain toggle is a no-op when nothing is currently selected.
            if (!prevSelStr) return null;
            return { selStr: toggleSidechainStr(prevSelStr), label: 'Toggle bysidech' };
        case 'around3':
        case 'around5':
        case 'around7':
        case 'around10':
        case 'aroundByres3':
        case 'aroundByres5':
        case 'aroundByres7':
        case 'aroundByres10': {
            // Around-selection rewrites the current selection; UXP
            // `molSelAround` early-returns when prev is empty.
            if (!prevSelStr) return null;
            const { dist, byres } = AROUND_KIND_DIST[kind];
            return {
                selStr: rewriteAround(prevSelStr, dist, byres),
                label: 'Around mol selection',
            };
        }
    }
}

function selectObjectMol(
    ctx: WorkerContext,
    args: SelectObjectMolArgs,
): SelectObjectMolResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.objId) as MolCoord | null;
    if (!mol) return { ok: false };

    // sel may not exist on non-molecular objects -- bail safely.
    const prevSelStr = safeRead(() => (mol.sel ? mol.sel.toString() : '')) ?? '';
    const resolved = resolveSelStr(args.kind, prevSelStr);
    if (!resolved) return { ok: false };

    withUndoTxn(scene, resolved.label, () => {
        applyMolSelStr(ctx, mol, resolved.selStr, scene.uid);
    });
    return { ok: true };
}

export const services = {
    selectObjectMol,
};
