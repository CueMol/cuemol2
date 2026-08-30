// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// MolStructPane (UXP `panel.molstruct`) data source for chain /
// residue / atom enumeration of one already-selected mol. Mol
// enumeration (the selector dropdown) lives in
// `listSceneObjects.service` and the `ObjectSelect` widget; this
// file only walks downward from a known molId.
//
// UXP reference: uxp_gui/cuemol2/base/content/molstruct-panel.js.

import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolChain } from '@cuemol/core/src/wrappers/MolChain';
import type { MolResidue } from '@cuemol/core/src/wrappers/MolResidue';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';

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

export interface GetMolResiduesArgs {
    sceneId: number;
    molId: number;
    chainName: string;
}

export interface MolResidueEntry {
    /**
     * ResidIndex serialised by C++ (e.g. "10" or "10A" -- insertion codes
     * are preserved). Keep as string in the wire format so callers can
     * round-trip the exact UXP selection-string syntax.
     */
    index: string;
    name: string;
    /** Single-letter residue code (UXP `getResidsJSON` `single` field). */
    single: string;
    /**
     * Whether this residue is in the molecule's current `sel`. Used by
     * the sequence panel for cyan highlighting; the molstruct tree
     * ignores it.
     */
    sel: boolean;
}

export interface GetMolResiduesResult {
    ok: boolean;
    residues: MolResidueEntry[];
}

export interface GetMolAtomsArgs {
    sceneId: number;
    molId: number;
    chainName: string;
    residueIndex: string;
}

export interface MolAtomEntry {
    id: number;
    name: string;
    elem: string;
}

export interface GetMolAtomsResult {
    ok: boolean;
    atoms: MolAtomEntry[];
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

interface RawResidueEntry {
    name?: unknown;
    single?: unknown;
    index?: unknown;
    sel?: unknown;
}

function parseResiduesJSON(json: string): MolResidueEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: MolResidueEntry[] = [];
    for (const raw of parsed as RawResidueEntry[]) {
        // C++ MolChain::getResidsJSON emits `index` as a string
        // (ResidIndex::toString()) so insertion codes survive.
        const index = typeof raw?.index === 'string' ? raw.index : String(raw?.index ?? '');
        if (!index) continue;
        out.push({
            index,
            name: typeof raw?.name === 'string' ? raw.name : '',
            single: typeof raw?.single === 'string' ? raw.single : '',
            sel: raw?.sel === true,
        });
    }
    return out;
}

function getMolResidues(
    ctx: WorkerContext,
    args: GetMolResiduesArgs,
): GetMolResiduesResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, residues: [] };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false, residues: [] };

    let chain: MolChain | null;
    try {
        chain = mol.getChain(args.chainName) as MolChain | null;
    } catch {
        return { ok: false, residues: [] };
    }
    if (!chain) return { ok: false, residues: [] };

    let json: string;
    try {
        json = chain.getResidsJSON();
    } catch {
        return { ok: false, residues: [] };
    }
    return { ok: true, residues: parseResiduesJSON(json) };
}

interface RawAtomEntry {
    name?: unknown;
    id?: unknown;
    elem?: unknown;
}

function parseAtomsJSON(json: string): MolAtomEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: MolAtomEntry[] = [];
    for (const raw of parsed as RawAtomEntry[]) {
        const id = typeof raw?.id === 'number' ? raw.id : Number(raw?.id);
        if (!Number.isFinite(id)) continue;
        out.push({
            id,
            name: typeof raw?.name === 'string' ? raw.name : '',
            elem: typeof raw?.elem === 'string' ? raw.elem : '',
        });
    }
    return out;
}

function getMolAtoms(
    ctx: WorkerContext,
    args: GetMolAtomsArgs,
): GetMolAtomsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, atoms: [] };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false, atoms: [] };

    let chain: MolChain | null;
    try {
        chain = mol.getChain(args.chainName) as MolChain | null;
    } catch {
        return { ok: false, atoms: [] };
    }
    if (!chain) return { ok: false, atoms: [] };

    let residue: MolResidue | null;
    try {
        // MolChain.getResidue takes a ResidIndex string ("10" / "10A").
        residue = chain.getResidue(args.residueIndex) as MolResidue | null;
    } catch {
        return { ok: false, atoms: [] };
    }
    if (!residue) return { ok: false, atoms: [] };

    let json: string;
    try {
        json = residue.getAtomsJSON();
    } catch {
        return { ok: false, atoms: [] };
    }
    return { ok: true, atoms: parseAtomsJSON(json) };
}

export const services = {
    getMolChains,
    getMolResidues,
    getMolAtoms,
};
