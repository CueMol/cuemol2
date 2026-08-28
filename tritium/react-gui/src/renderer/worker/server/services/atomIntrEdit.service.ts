// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// atom-interaction "Edit interaction list" (UXP `tools/aintr-edit-dlg`).
//
// Lists the distance / angle / torsion definitions stored on an `atomintr`
// renderer and deletes selected entries. Backs the renderer-ctxmenu "Edit
// interaction list..." dialog and fills the gap left by the AtomIntr inspector
// section (which edits display props, not the entry list).
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

/** The atomintr-renderer methods this service touches (not on the base type). */
interface AtomIntrRend {
    getDefsJSON(): string;
    /** Remove a definition by its stable index id (see ADR-0027). */
    remove(id: number): boolean;
}

/** One interaction definition: mode 1 = distance, 2 = angle, 3 = torsion. */
export interface AtomIntrDefEntry {
    id: number;
    mode: number;
    /** Atom labels (2 for distance, 3 for angle, 4 for torsion). */
    atoms: string[];
}

export interface ListAtomIntrDefsArgs {
    sceneId: number;
    rendId: number;
}

export interface ListAtomIntrDefsResult {
    ok: boolean;
    entries: AtomIntrDefEntry[];
}

export interface RemoveAtomIntrDefsArgs {
    sceneId: number;
    rendId: number;
    ids: number[];
}

export interface RemoveAtomIntrDefsResult {
    ok: boolean;
    removed: number;
}

/** Raw `getDefsJSON` element shape. */
interface RawDef {
    id?: number;
    mode?: number;
    a0?: string;
    a1?: string;
    a2?: string;
    a3?: string;
}

function getRend(scene: Scene, rendId: number): AtomIntrRend | null {
    const rend = scene.getRenderer(rendId);
    if (!rend) return null;
    return rend as unknown as AtomIntrRend;
}

function listAtomIntrDefs(
    ctx: WorkerContext,
    args: ListAtomIntrDefsArgs,
): ListAtomIntrDefsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, entries: [] };
    const rend = getRend(scene, args.rendId);
    if (!rend) return { ok: false, entries: [] };

    let raw: RawDef[] = [];
    try {
        const json = rend.getDefsJSON();
        if (json) raw = JSON.parse(json) as RawDef[];
    } catch {
        raw = [];
    }

    const entries: AtomIntrDefEntry[] = raw
        .filter((d) => typeof d.id === 'number')
        .map((d) => {
            const atoms: string[] = [];
            if (d.a0 != null) atoms.push(d.a0);
            if (d.a1 != null) atoms.push(d.a1);
            if (d.a2 != null) atoms.push(d.a2);
            if (d.a3 != null) atoms.push(d.a3);
            return { id: d.id as number, mode: d.mode ?? 0, atoms };
        });
    return { ok: true, entries };
}

function removeAtomIntrDefs(
    ctx: WorkerContext,
    args: RemoveAtomIntrDefsArgs,
): RemoveAtomIntrDefsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, removed: 0 };
    const rend = getRend(scene, args.rendId);
    if (!rend) return { ok: false, removed: 0 };

    // `remove(id)` empties slot m_data[id] without shifting other indices
    // (ADR-0027), so the ids stay valid regardless of removal order.
    let removed = 0;
    withUndoTxn(scene, 'Remove interaction', () => {
        for (const id of args.ids) {
            if (rend.remove(id)) removed++;
        }
    });
    return { ok: true, removed };
}

export const services = {
    listAtomIntrDefs,
    removeAtomIntrDefs,
};
