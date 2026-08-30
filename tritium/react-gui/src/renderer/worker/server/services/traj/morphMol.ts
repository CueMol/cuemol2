/**
 * @file worker/server/services/morphMol.service.ts
 * @description Worker services backing the Tools > "Mol morphing animation..."
 * dialog. Ports UXP `tools/morphanim-tool.js`:
 *   - convertToMorphMol: replace a MolCoord with a MorphMol carrying the same
 *     atoms and renderers (UXP `convToMorphMol`) -- serialize via
 *     `StreamManager.toXML2(mol, 'MorphMol')` / `fromXML`, register the
 *     current coordinates as frame 0 (`appendThisFrame`, mandatory: without
 *     it MorphMol.update() is a no-op), then swap the objects in the scene.
 *   - getMorphFrames: parse `MorphMol.getFrameInfoJSON()` for the dialog list.
 *   - addMorphFrameFromFile: load a PDB file (gzip supported) as a detached
 *     MolCoord and `insertBefore` it as a frame (UXP `addPDBFile`). Frame
 *     molecules are intentionally NOT added to the scene.
 *   - addMorphFrameFromMol: deep-copy an existing scene MolCoord via
 *     `toXML`/`fromXML` and insert it as a frame (UXP `addMolCoord`).
 *   - removeMorphFrame: delete one frame (UXP `onDelete`); the "(this)" frame
 *     is refused here explicitly (C++ ignores the request silently).
 *
 * Undo labels follow UXP ('Conv Mol to MorphMol' / 'Add PDB to MorphMol' /
 * 'Delete MorphMol item') except addMorphFrameFromMol, which uses
 * 'Add mol to MorphMol' (UXP reuses the PDB label there by mistake).
 * MorphMol.insertBefore/removeFrame push their own EditInfo records, so all
 * mutations must run inside an undo txn.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MorphMol } from '@cuemol/core/src/wrappers/MorphMol';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName';
import { withUndoTxn } from '../withUndoTxn';

const log = console;

// Minimal reader surface (driven through casts, like trajectory.service).
interface PdbReaderHandle {
    compress: string;
    setPath(path: string): void;
    attach(obj: unknown): void;
    read(): void;
    detach(): void;
    createDefaultObj(): unknown;
}

function basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}

function getClassNameOf(obj: unknown): string {
    try {
        return (obj as { getClassName?: () => string }).getClassName?.() ?? '';
    } catch {
        return '';
    }
}

/** Resolve scene + target object, requiring it to be a MorphMol. */
function resolveMorph(
    ctx: WorkerContext,
    sceneId: number,
    objId: number,
): { scene: Scene; morph: MorphMol } | null {
    const scene = getSceneOrNull(ctx, sceneId);
    if (!scene) return null;
    const obj = scene.getObject(objId) as CueMolObject | null;
    if (!obj) return null;
    if (getClassNameOf(obj) !== 'MorphMol') return null;
    return { scene, morph: obj as unknown as MorphMol };
}

// ---- convertToMorphMol ----

export interface ConvertToMorphMolArgs {
    sceneId: number;
    /** Source MolCoord uid; replaced in-scene by the new MorphMol. */
    objId: number;
}

export interface ConvertToMorphMolResult {
    ok: boolean;
    error?: string;
    /** UID of the new MorphMol on success. */
    morphObjId?: number;
    morphObjName?: string;
}

export function convertToMorphMol(
    ctx: WorkerContext,
    args: ConvertToMorphMolArgs,
): ConvertToMorphMolResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };
    if (getClassNameOf(mol) === 'MorphMol') {
        return { ok: false, error: 'object is already a MorphMol' };
    }

    let morphObjId = -1;
    let morphObjName = '';
    try {
        withUndoTxn(scene, 'Conv Mol to MorphMol', () => {
            const molName = (mol as unknown as { name: string }).name ?? '';
            // Serialize with the type overwritten to MorphMol; renderers are
            // part of the object XML, so the new object keeps them.
            const xml = ctx.strMgr.toXML2(
                mol as unknown as Parameters<typeof ctx.strMgr.toXML2>[0],
                'MorphMol',
            );
            const morph = ctx.strMgr.fromXML(xml, args.sceneId) as unknown as MorphMol | null;
            if (!morph) throw new Error('MorphMol conversion failed');
            // Register the current coordinates as frame 0; this also fixes
            // the atom-index map the interpolation needs.
            morph.appendThisFrame();
            (morph as unknown as { name: string }).name = molName;
            scene.destroyObject(args.objId);
            scene.addObject(morph as unknown as CueMolObject);
            morphObjId = (morph as unknown as { uid: number }).uid ?? -1;
            morphObjName = molName;
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`[worker] convertToMorphMol failed: ${msg}`);
        return { ok: false, error: msg };
    }

    if (morphObjId < 0) return { ok: false, error: 'conversion failed' };
    return { ok: true, morphObjId, morphObjName };
}

// ---- getMorphFrames ----

export interface MorphFrameInfo {
    /** Frame name ("(this)" for the base-coordinates frame). */
    name: string;
    /** Source path ('' for the base frame). */
    src: string;
    /** True for the base-coordinates frame (srctype "<this>"); not removable. */
    isThis: boolean;
}

export interface GetMorphFramesArgs {
    sceneId: number;
    objId: number;
}

export interface GetMorphFramesResult {
    ok: boolean;
    /** False when the object exists but is not a MorphMol (drives the
     *  dialog's "Convert to MorphMol" branch). */
    isMorphMol: boolean;
    frames: MorphFrameInfo[];
}

export function getMorphFrames(
    ctx: WorkerContext,
    args: GetMorphFramesArgs,
): GetMorphFramesResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, isMorphMol: false, frames: [] };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false, isMorphMol: false, frames: [] };
    if (getClassNameOf(obj) !== 'MorphMol') {
        return { ok: true, isMorphMol: false, frames: [] };
    }

    let raw = '';
    try {
        raw = (obj as unknown as MorphMol).getFrameInfoJSON() ?? '';
    } catch (e) {
        log.warn('[worker] getFrameInfoJSON failed:', e);
        return { ok: false, isMorphMol: true, frames: [] };
    }
    let parsed: Array<{ name?: string; src?: string; srctype?: string }> = [];
    try {
        parsed = raw ? JSON.parse(raw) : [];
    } catch (e) {
        log.warn('[worker] getFrameInfoJSON parse failed:', e);
        return { ok: false, isMorphMol: true, frames: [] };
    }
    const frames = parsed.map((f) => ({
        name: f.name ?? '',
        src: f.src ?? '',
        isThis: f.srctype === '<this>',
    }));
    return { ok: true, isMorphMol: true, frames };
}

// ---- frame edits ----

export interface AddMorphFrameFromFileArgs {
    sceneId: number;
    objId: number;
    /** PDB file path (.pdb / .ent, optionally .gz). */
    path: string;
    /** Frame index to insert before; -1 (or out of range) appends. */
    insertIndex: number;
}

export interface AddMorphFrameFromMolArgs {
    sceneId: number;
    objId: number;
    /** Scene MolCoord uid to deep-copy as the new frame. */
    srcObjId: number;
    /** Frame index to insert before; -1 (or out of range) appends. */
    insertIndex: number;
}

export interface RemoveMorphFrameArgs {
    sceneId: number;
    objId: number;
    frameIndex: number;
}

export interface MorphFrameEditResult {
    ok: boolean;
    error?: string;
}

export function addMorphFrameFromFile(
    ctx: WorkerContext,
    args: AddMorphFrameFromFileArgs,
): MorphFrameEditResult {
    const rm = resolveMorph(ctx, args.sceneId, args.objId);
    if (!rm) return { ok: false, error: 'MorphMol not found' };
    const { scene, morph } = rm;

    try {
        return withUndoTxn(scene, 'Add PDB to MorphMol', () => {
            const reader = ctx.strMgr.createHandler(
                'pdb', OBJREADER_CATEGORY,
            ) as unknown as PdbReaderHandle | null;
            if (!reader) throw new Error('pdb reader not available');
            reader.setPath(args.path);
            if (args.path.toLowerCase().endsWith('.gz')) {
                reader.compress = 'gzip';
            }
            const frameMol = reader.createDefaultObj();
            reader.attach(frameMol);
            reader.read();
            reader.detach();
            // The frame molecule stays detached from the scene: MorphMol owns
            // it and serializes it in its <frames> node (UXP parity).
            (frameMol as { name: string }).name = basename(args.path);
            morph.insertBefore(frameMol as MolCoord, args.insertIndex);
            return { ok: true };
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`[worker] addMorphFrameFromFile failed: ${msg}`);
        return { ok: false, error: msg };
    }
}

export function addMorphFrameFromMol(
    ctx: WorkerContext,
    args: AddMorphFrameFromMolArgs,
): MorphFrameEditResult {
    const rm = resolveMorph(ctx, args.sceneId, args.objId);
    if (!rm) return { ok: false, error: 'MorphMol not found' };
    const { scene, morph } = rm;
    const src = scene.getObject(args.srcObjId) as CueMolObject | null;
    if (!src) return { ok: false, error: 'source molecule not found' };

    try {
        return withUndoTxn(scene, 'Add mol to MorphMol', () => {
            // Deep copy so later edits to the source molecule do not mutate
            // the captured frame (UXP addMolCoord toXML/fromXML round trip).
            const xml = ctx.strMgr.toXML(
                src as unknown as Parameters<typeof ctx.strMgr.toXML>[0],
            );
            const copy = ctx.strMgr.fromXML(xml, args.sceneId) as unknown as MolCoord | null;
            if (!copy) throw new Error('molecule copy failed');
            morph.insertBefore(copy, args.insertIndex);
            return { ok: true };
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`[worker] addMorphFrameFromMol failed: ${msg}`);
        return { ok: false, error: msg };
    }
}

export function removeMorphFrame(
    ctx: WorkerContext,
    args: RemoveMorphFrameArgs,
): MorphFrameEditResult {
    const rm = resolveMorph(ctx, args.sceneId, args.objId);
    if (!rm) return { ok: false, error: 'MorphMol not found' };
    const { scene, morph } = rm;

    // C++ removeFrame silently ignores the "(this)" frame and out-of-range
    // indices; refuse explicitly so the UI never commits a no-op txn.
    const info = getMorphFrames(ctx, { sceneId: args.sceneId, objId: args.objId });
    const frame = info.frames[args.frameIndex];
    if (!frame) return { ok: false, error: 'frame index out of range' };
    if (frame.isThis) return { ok: false, error: 'the "(this)" frame cannot be removed' };

    try {
        return withUndoTxn(scene, 'Delete MorphMol item', () => {
            morph.removeFrame(args.frameIndex);
            return { ok: true };
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`[worker] removeMorphFrame failed: ${msg}`);
        return { ok: false, error: msg };
    }
}
