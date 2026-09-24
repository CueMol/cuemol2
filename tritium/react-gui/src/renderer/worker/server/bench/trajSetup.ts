/**
 * @file worker/server/bench/trajSetup.ts
 * @description Build an mdtools Trajectory from a topology file and its
 * coordinate files, for the `md-playback` scenario.
 *
 * The sequence is the one the mdtools plugin's `loadTrajectory` runs
 * (plugins/mdtools/worker/loadTrajectory.ts) and the C++ test
 * `makeWaterTrajectory()` (test_trajio.cpp) pins: an empty Trajectory, the
 * topology reader attached to it rather than to its own default MolCoord, the
 * object added to the scene, then one TrajBlock per coordinate file resolved
 * through `targTrajUID`. It is repeated here rather than imported because core
 * may not import a plugin's internals, and because the harness needs two
 * things the plugin does not offer: a topology reader other than `gro` (the
 * public trajectories in the corpus ship their topology as PDB) and control
 * over `lazy_load`.
 *
 * `Trajectory::append` throws when a block's coordinate count differs from
 * the topology's atom count, so a topology read that dropped or merged atoms
 * fails here instead of producing a cell whose atoms are scrambled.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { RendererOptions } from '@renderer/worker/shared/fileOpenTypes';
import { setupRenderer } from '@renderer/worker/server/services/rend/setupRenderer';
import { OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName';

/** Coordinate-file extension -> mdtools TrajBlockReader nickname. */
const TRAJ_READER_BY_EXT: Record<string, string> = {
    dcd: 'dcdtraj',
    xtc: 'xtctraj',
    trr: 'trrtraj',
};

interface ObjReaderHandle {
    setPath(path: string): void;
    attach(obj: unknown): void;
    read(): void;
    detach(): void;
    createDefaultObj(): unknown;
}

interface TrajBlockReaderHandle extends ObjReaderHandle {
    targTrajUID: number;
    nevery: number;
    lazy_load: boolean;
}

interface TrajObj {
    uid: number;
    name: string;
    nframe: number;
    nblock: number;
    append(block: unknown): void;
}

export interface TrajSetupArgs {
    sceneId: number;
    topologyPath: string;
    topologyReader: string;
    trajPaths: string[];
    nevery?: number;
    /** The block readers' `lazy_load`; the reader default (true) when absent. */
    lazy?: boolean;
    renderer: RendererOptions;
}

export interface TrajSetupResult {
    ok: boolean;
    error?: string;
    objId?: number;
    frames?: number;
    blocks?: number;
    formats?: string[];
    /** The `lazy_load` the block readers ended up with. */
    lazy?: boolean | null;
}

function fileExt(p: string): string {
    const base = p.split(/[\\/]/).pop() ?? p;
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Assemble the Trajectory, give it the spec's renderer, and report how many
 * frames it ended up with.
 */
export function setupTrajectory(ctx: WorkerContext, args: TrajSetupArgs): TrajSetupResult {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    if (args.trajPaths.length === 0) return { ok: false, error: 'no trajectory files in the spec' };

    try {
        const traj = ctx.svc.createObj('Trajectory') as unknown as TrajObj;
        if (!traj) return { ok: false, error: 'could not create a Trajectory' };

        const topo = ctx.strMgr.createHandler(
            args.topologyReader, OBJREADER_CATEGORY,
        ) as unknown as ObjReaderHandle | null;
        if (!topo) return { ok: false, error: `topology reader "${args.topologyReader}" not available` };
        topo.setPath(args.topologyPath);
        topo.attach(traj);
        topo.read();
        topo.detach();

        traj.name = args.renderer.objectName;
        (scene as unknown as { addObject(o: unknown): void }).addObject(traj);

        const formats: string[] = [];
        let lazy: boolean | null = null;
        for (const p of args.trajPaths) {
            const ext = fileExt(p);
            const nick = TRAJ_READER_BY_EXT[ext];
            if (!nick) return { ok: false, error: `unsupported trajectory format ".${ext}": ${p}` };
            const reader = ctx.strMgr.createHandler(
                nick, OBJREADER_CATEGORY,
            ) as unknown as TrajBlockReaderHandle | null;
            if (!reader) return { ok: false, error: `trajectory reader "${nick}" not available` };
            reader.targTrajUID = traj.uid;
            if (args.nevery && args.nevery > 1) reader.nevery = args.nevery;
            if (args.lazy !== undefined) reader.lazy_load = args.lazy;
            lazy = Boolean(reader.lazy_load);
            const block = reader.createDefaultObj();
            reader.attach(block);
            reader.setPath(p);
            reader.read();
            reader.detach();
            traj.append(block);
            formats.push(ext);
        }

        setupRenderer(ctx, traj, args.renderer);

        const frames = Number(traj.nframe) || 0;
        if (frames < 2) {
            return { ok: false, error: `trajectory has ${frames} frame(s); playback needs two` };
        }
        return {
            ok: true,
            objId: traj.uid,
            frames,
            blocks: Number(traj.nblock) || 0,
            formats,
            lazy,
        };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
