// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Read / seek / append operations for a loaded MD trajectory
// (mdtools::Trajectory : AnimMol : MolCoord), driving the MD Trajectory bottom
// pane. Three surfaces are used, all through raw scriptable access:
//
//   - frame cursor: `frame` (rw seek) + `nframe` (ro total).
//   - block segmentation: `nblock` + `getBlock(i)` -> TrajBlock, each exposing
//     `name` / `src` (source file path) / `nframe` / `start_index`. These block
//     getters were added to Trajectory.qif / TrajBlock.qif for this pane.
//   - `append(TrajBlock)`: add a coordinate block to an existing trajectory.
//
// getTrajectoryState / setTrajectoryFrame are read/seek only; seeking is
// transient view state (like the Animation transport) and is deliberately NOT
// wrapped in an undo txn. appendTrajectoryBlock mutates persistent scene state
// and runs inside one undo txn; a coord-count mismatch throws from
// Trajectory::append and rolls the append back, surfaced as an error string.
//
// The native objects are driven through `as unknown as` casts, so their
// surfaces are described by the minimal local interfaces below.

import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { OBJREADER_CATEGORY } from './helpers/pickReaderName';

const log = console;

// Trajectory file extension -> block reader nickname (mdtools TrajBlockReader).
const TRAJ_READER_BY_EXT: Record<string, string> = {
    dcd: 'dcdtraj',
    xtc: 'xtctraj',
    trr: 'trrtraj',
};

// Minimal native-object surfaces (all calls go through `as unknown as` casts).
interface TrajBlockObj {
    uid: number;
    name: string;
    src: string;
    nframe: number;
    start_index: number;
}

interface TrajObj {
    uid: number;
    frame: number;
    nframe: number;
    nblock: number;
    getBlock(index: number): unknown;
    append(block: unknown): void;
}

interface TrajBlockReaderHandle {
    targTrajUID: number;
    nevery: number;
    setPath(path: string): void;
    attach(obj: unknown): void;
    read(): void;
    detach(): void;
    createDefaultObj(): unknown;
}

interface SceneHandle {
    getObject(uid: number): unknown;
}

export interface TrajBlockInfo {
    /** Block object uid. */
    uid: number;
    /** Block object name. */
    name: string;
    /** Source file path of the block. */
    src: string;
    /** Number of frames in this block. */
    nframe: number;
    /** Start frame index of this block within the trajectory. */
    startIndex: number;
    /** Upper-case format badge derived from the source extension (XTC/DCD/TRR). */
    format: string;
}

export interface TrajectoryState {
    ok: boolean;
    /** Total frame count across all blocks. */
    nframe: number;
    /** Current frame cursor (0-based). */
    frame: number;
    /** Ordered block segments (empty when the object is not a trajectory). */
    blocks: TrajBlockInfo[];
}

export interface GetTrajectoryStateArgs {
    sceneId: number;
    objId: number;
}

export interface SetTrajectoryFrameArgs {
    sceneId: number;
    objId: number;
    /** Target frame; clamped to [0, nframe-1]. */
    frame: number;
}

export interface SetTrajectoryFrameResult {
    ok: boolean;
    /** The frame actually set (post-clamp). */
    frame: number;
}

export interface AppendTrajectoryBlockArgs {
    sceneId: number;
    objId: number;
    /** Trajectory file (.dcd/.xtc/.trr). */
    path: string;
    /** Load every Nth frame (default 1). */
    nevery?: number;
}

export interface AppendTrajectoryBlockResult {
    ok: boolean;
    /** Total frame count after the append. */
    nframe?: number;
    /** Error message on failure (e.g. atom-count mismatch). */
    error?: string;
}

const EMPTY_STATE: TrajectoryState = { ok: false, nframe: 0, frame: 0, blocks: [] };

/** Read a numeric getter defensively (missing-on-subclass getters can throw). */
function safeNum(fn: () => number, dflt = 0): number {
    try {
        const v = fn();
        return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
    } catch {
        return dflt;
    }
}

/** Read a string getter defensively. */
function safeStr(fn: () => string, dflt = ''): string {
    try {
        const v = fn();
        return typeof v === 'string' ? v : dflt;
    } catch {
        return dflt;
    }
}

/** Lower-cased final extension (without the dot). */
function fileExt(filePath: string): string {
    const base = filePath.split(/[\\/]/).pop() ?? filePath;
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Resolve the target scene object as a Trajectory handle (null if absent). */
function resolveTraj(ctx: WorkerContext, sceneId: number, objId: number): TrajObj | null {
    const scene = ctx.sceMgr.getScene(sceneId);
    if (!scene) return null;
    const obj = (scene as unknown as SceneHandle).getObject(objId);
    if (!obj) return null;
    return obj as unknown as TrajObj;
}

/** Read the trajectory frame cursor + block segmentation for the pane. */
function getTrajectoryState(
    ctx: WorkerContext,
    args: GetTrajectoryStateArgs,
): TrajectoryState {
    const traj = resolveTraj(ctx, args.sceneId, args.objId);
    if (!traj) return EMPTY_STATE;
    // A non-trajectory object has no nframe; treat that as "not a trajectory".
    const nframe = safeNum(() => traj.nframe, -1);
    if (nframe < 0) return EMPTY_STATE;

    const nblock = safeNum(() => traj.nblock, 0);
    const blocks: TrajBlockInfo[] = [];
    for (let i = 0; i < nblock; i++) {
        let blk: TrajBlockObj | null = null;
        try {
            blk = traj.getBlock(i) as unknown as TrajBlockObj;
        } catch {
            blk = null;
        }
        if (!blk) continue;
        const src = safeStr(() => blk!.src);
        blocks.push({
            uid: safeNum(() => blk!.uid),
            name: safeStr(() => blk!.name),
            src,
            nframe: safeNum(() => blk!.nframe),
            startIndex: safeNum(() => blk!.start_index),
            format: fileExt(src).toUpperCase(),
        });
    }
    return { ok: true, nframe, frame: safeNum(() => traj.frame, 0), blocks };
}

/** Seek the trajectory to a frame (clamped). Transient -- no undo txn. */
function setTrajectoryFrame(
    ctx: WorkerContext,
    args: SetTrajectoryFrameArgs,
): SetTrajectoryFrameResult {
    const traj = resolveTraj(ctx, args.sceneId, args.objId);
    if (!traj) return { ok: false, frame: 0 };
    const nframe = safeNum(() => traj.nframe, 0);
    if (nframe <= 0) return { ok: false, frame: 0 };
    const target = Math.max(0, Math.min(Math.trunc(args.frame), nframe - 1));
    try {
        traj.frame = target;
    } catch {
        return { ok: false, frame: safeNum(() => traj.frame, 0) };
    }
    return { ok: true, frame: safeNum(() => traj.frame, target) };
}

/** Append one coordinate block (Add block) to an existing trajectory. */
function appendTrajectoryBlock(
    ctx: WorkerContext,
    args: AppendTrajectoryBlockArgs,
): AppendTrajectoryBlockResult {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    const traj = resolveTraj(ctx, args.sceneId, args.objId);
    if (!traj) return { ok: false, error: 'trajectory not found' };
    const ext = fileExt(args.path);
    const nick = TRAJ_READER_BY_EXT[ext];
    if (!nick) return { ok: false, error: `unsupported trajectory format ".${ext}"` };
    const nevery = args.nevery && args.nevery > 1 ? args.nevery : 1;

    try {
        return withUndoTxn(scene, 'Add trajectory block', () => {
            const reader = ctx.strMgr.createHandler(
                nick, OBJREADER_CATEGORY,
            ) as unknown as TrajBlockReaderHandle | null;
            if (!reader) throw new Error(`trajectory reader "${nick}" not available`);
            reader.targTrajUID = traj.uid;
            if (nevery > 1) reader.nevery = nevery;
            const block = reader.createDefaultObj();
            reader.attach(block);
            reader.setPath(args.path);
            reader.read();
            reader.detach();
            traj.append(block);
            return { ok: true, nframe: safeNum(() => traj.nframe, 0) };
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`[worker] appendTrajectoryBlock failed: ${msg}`);
        return { ok: false, error: msg };
    }
}

export const services = { getTrajectoryState, setTrajectoryFrame, appendTrajectoryBlock };
