/**
 * @file worker/server/bench/morphSetup.ts
 * @description Build a two-frame morph so a cell can measure the path where
 * coordinates change but topology does not.
 *
 * That path -- `fireAtomsMoved` and everything the renderers do in response --
 * is what a trajectory drives, and it behaves nothing like `prop-change`: a
 * coordinate-texture renderer can push new positions without touching its
 * vertex buffers, while a mesh renderer has to rebuild. Measuring it needs a
 * second set of coordinates for the same atoms. Trajectories would need one
 * per structure in the size ladder and RCSB serves none, so the corpus carries
 * a displaced copy of each structure instead (`tritium/bench/perturb.py`) and
 * `MorphMol` interpolates between the two. `MorphMol.update` ends in
 * `fireAtomsMoved` exactly as a trajectory frame change does, so the renderers
 * cannot tell the difference.
 *
 * The frame is added with `addMorphFrameFromMol` rather than
 * `addMorphFrameFromFile`, because that one goes through the PDB reader and
 * the large entries in the ladder have no PDB form at all -- too many chains.
 * Going via a scene object keeps every size on mmCIF.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { loadObject } from '@renderer/worker/server/services/file/loadObject';
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen';
import {
    addMorphFrameFromMol,
    convertToMorphMol,
} from '@renderer/worker/server/services/morph/morphMol';

export interface MorphSetupArgs {
    sceneId: number;
    /** The loaded structure, which becomes frame 0. */
    objId: number;
    /** Displaced copy of the same structure, which becomes frame 1. */
    morphFile: string;
    readerName: string;
    rendererType: string;
    selection: string | null;
}

export interface MorphSetupResult {
    ok: boolean;
    error?: string;
    /** UID of the MorphMol that replaced the loaded object. */
    objId?: number;
    /** How many frames the morph ended up with; 2 when the setup worked. */
    frames?: number;
}

/**
 * Replace the loaded object with a MorphMol carrying the same atoms and
 * renderers, then append the displaced structure as its second frame.
 */
export function setupMorph(ctx: WorkerContext, args: MorphSetupArgs): MorphSetupResult {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    // Frame 0 is the structure as loaded; convertToMorphMol registers the
    // current coordinates itself (without that, MorphMol.update is a no-op).
    const conv = convertToMorphMol(ctx, { sceneId: args.sceneId, objId: args.objId });
    if (!conv.ok || conv.morphObjId === undefined) {
        return { ok: false, error: conv.error ?? 'convertToMorphMol failed' };
    }
    const morphObjId = conv.morphObjId;

    // The displaced copy has to reach the scene before it can be copied in as
    // a frame, so it is loaded, copied, and destroyed again -- leaving it in
    // the scene would put a second structure in front of the camera and the
    // cell would be measuring both.
    const options = buildHeadlessFileOpenOptions(ctx, {
        readerName: args.readerName,
        objectName: 'bench-morph-target',
        rendererType: args.rendererType,
        selection: args.selection,
    });
    const src = loadObject(ctx, {
        filePath: args.morphFile,
        sceneId: args.sceneId,
        options,
        contentFirst: false,
        readerName: args.readerName,
    });
    if (!src.ok) return { ok: false, error: `morph target: ${src.error ?? 'load failed'}` };

    try {
        const added = addMorphFrameFromMol(ctx, {
            sceneId: args.sceneId,
            objId: morphObjId,
            srcObjId: src.objId,
            insertIndex: -1,
        });
        if (!added.ok) return { ok: false, error: added.error ?? 'addMorphFrame failed' };
    } finally {
        try {
            scene.destroyObject(src.objId);
        } catch (e) {
            console.warn('[bench] could not remove the morph target object:', e);
        }
    }

    const morph = scene.getObject(morphObjId) as unknown as Record<string, unknown> | null;
    const frames = Number((morph as { getProp?: (n: string) => unknown })?.getProp?.('nframe') ?? 0);
    if (frames < 2) {
        return { ok: false, error: `morph has ${frames} frame(s); two are needed to interpolate` };
    }

    return { ok: true, objId: morphObjId, frames };
}
