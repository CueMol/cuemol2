// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// MolStructPane (UXP `panel.molstruct`) data source:
//   - listMols: enumerate MolCoord-like objects in a scene for the
//     molecule selector dropdown.
//   - getMolChains: chain-level data for the structure tree.
//
// UXP reference: uxp_gui/cuemol2/base/content/molstruct-panel.js
// (`setupTreeData` + `mSelector` ObjMenuList with `implIface(elem.type,
// "MolCoord")` filter).
//
// Phase 1 only fetches chain names eagerly; residue / atom enumeration
// will arrive in Phase 2 alongside lazy node loading.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { parseSceneTreeJSON, type SceneTreeNode } from '../../shared/sceneTreeTypes';

export interface ListMolsArgs {
    sceneId: number;
}

export interface MolListEntry {
    /** C++ uid of the MolCoord object. */
    uid: number;
    /** Display name. */
    name: string;
}

export interface ListMolsResult {
    mols: MolListEntry[];
}

export interface GetMolChainsArgs {
    sceneId: number;
    molId: number;
}

export interface MolChainEntry {
    /** Single-letter (or short) chain name, e.g. "A". */
    name: string;
}

export interface GetMolChainsResult {
    ok: boolean;
    chains: MolChainEntry[];
}

/**
 * Probe a Scene object for MolCoord-like behaviour via duck typing on
 * `getChainsJSON`. This mirrors UXP `cuemol.implIface(elem.type,
 * "MolCoord")` without hard-coding the (small) set of derived class names.
 */
function isMolCoordLike(obj: CueMolObject | null): obj is MolCoord {
    if (!obj) return false;
    const candidate = obj as unknown as { getChainsJSON?: unknown };
    return typeof candidate.getChainsJSON === 'function';
}

function collectObjectNodes(scene: Scene): SceneTreeNode[] {
    let json: string;
    try {
        json = scene.getSceneDataJSON();
    } catch {
        return [];
    }
    const tree = parseSceneTreeJSON(json);
    if (!tree) return [];
    return tree.children.filter((n) => n.type === 'object');
}

function listMols(ctx: WorkerContext, args: ListMolsArgs): ListMolsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { mols: [] };

    const out: MolListEntry[] = [];
    for (const node of collectObjectNodes(scene)) {
        const obj = scene.getObject(node.id) as CueMolObject | null;
        if (!isMolCoordLike(obj)) continue;
        out.push({ uid: node.id, name: node.name });
    }
    return { mols: out };
}

function parseChainsJSON(json: string): MolChainEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: MolChainEntry[] = [];
    for (const entry of parsed) {
        // UXP `getChainsJSON()` emits an array of plain strings
        // (one per chain name). Accept either string or { name }
        // for forward-compatibility.
        if (typeof entry === 'string') {
            out.push({ name: entry });
        } else if (entry && typeof (entry as { name?: unknown }).name === 'string') {
            out.push({ name: (entry as { name: string }).name });
        }
    }
    return out;
}

function getMolChains(ctx: WorkerContext, args: GetMolChainsArgs): GetMolChainsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, chains: [] };
    const obj = scene.getObject(args.molId) as CueMolObject | null;
    if (!isMolCoordLike(obj)) return { ok: false, chains: [] };

    let json: string;
    try {
        json = obj.getChainsJSON();
    } catch {
        return { ok: false, chains: [] };
    }
    return { ok: true, chains: parseChainsJSON(json) };
}

export const services = {
    listMols,
    getMolChains,
};
