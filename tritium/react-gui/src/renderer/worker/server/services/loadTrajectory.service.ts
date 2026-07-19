// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Loads an MD simulation trajectory as a block-centric Trajectory object
// (mdtools::Trajectory : AnimMol : MolCoord). Unlike loadObject (single
// reader -> single object), a trajectory is assembled from a topology file
// plus one or more coordinate-frame files:
//
//   1. Create an empty Trajectory.
//   2. Read the topology into it by attaching the topology ObjReader to the
//      pre-created Trajectory -- NOT to the reader's default MolCoord -- so the
//      atoms land on the Trajectory (which is itself a MolCoord). This mirrors
//      the C++ test makeWaterTrajectory() (test_trajio.cpp).
//   3. For each trajectory file, read a TrajBlock and append it to the
//      Trajectory. Frames concatenate in file order. Each block reader resolves
//      its parent Trajectory through targTrajUID, so the object must be added
//      to the scene (uid-resolvable) before the block reads run.
//   4. setupRenderer wires the initial renderer, reused unchanged from the
//      normal load-object flow (Trajectory is MolCoord-derived).
//
// Everything runs inside one undo txn. Trajectory::append validates that the
// block coordinate count matches the topology atom count; a mismatch throws
// and rolls the whole load back, surfaced to the command as an error dialog.
//
// The native objects are driven through raw scriptable methods, so their
// surfaces are described by the minimal local interfaces below (the generated
// wrapper types add nothing over these casts).
import type { WorkerContext } from '../types/WorkerContext';
import type { RendererOptions } from '../../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';
import { withUndoTxn } from './withUndoTxn';
import { OBJREADER_CATEGORY } from './helpers/pickReaderName';

const log = console;

// Topology reader nickname. Only GROMACS .gro is supported for now; AMBER
// prmtop and NAMD psf are deferred (see ADR-md-trajectory-open-dialog).
const TOPOLOGY_READER = 'gro';

// Trajectory file extension -> block reader nickname. These are the mdtools
// TrajBlockReader nicknames registered under the OBJREADER category.
const TRAJ_READER_BY_EXT: Record<string, string> = {
    dcd: 'dcdtraj',
    xtc: 'xtctraj',
    trr: 'trrtraj',
};

// Minimal native-object surfaces (all calls go through `as unknown as` casts).
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
}

interface TrajObj {
    uid: number;
    name: string;
    append(block: unknown): void;
}

interface SceneHandle {
    addObject(obj: unknown): void;
}

export interface LoadTrajectoryArgs {
    sceneId: number;
    /** Topology file (GROMACS .gro). */
    topologyPath: string;
    /** Trajectory files (.dcd/.xtc/.trr) in frame-concatenation order. */
    trajPaths: string[];
    /** Load every Nth frame (applied to every trajectory reader). Default 1. */
    nevery?: number;
    /** Initial renderer options (from the renderer dialog). */
    renderer: RendererOptions;
}

/** File basename with its final extension removed (path stem). */
function fileStem(filePath: string): string {
    const base = filePath.split(/[\\/]/).pop() ?? filePath;
    return base.replace(/\.[^.]+$/, '');
}

/** Lower-cased final extension (without the dot). */
function fileExt(filePath: string): string {
    const base = filePath.split(/[\\/]/).pop() ?? filePath;
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function loadTrajectory(
    ctx: WorkerContext,
    args: LoadTrajectoryArgs,
): { ok: boolean; objId?: number } {
    log.info(
        `[worker] loading MD trajectory: topology=${args.topologyPath}, ${args.trajPaths.length} traj file(s)`,
    );

    if (!args.trajPaths.length) {
        log.warn('[worker] loadTrajectory: no trajectory files given');
        return { ok: false };
    }

    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) {
        log.warn(`[worker] loadTrajectory: scene ${args.sceneId} not found`);
        return { ok: false };
    }

    const nevery = args.nevery && args.nevery > 1 ? args.nevery : 1;

    return withUndoTxn(scene, 'Open MD trajectory', () => {
        // 1. Empty Trajectory object.
        const traj = ctx.svc.createObj('Trajectory') as unknown as TrajObj;
        if (!traj) throw new Error('failed to create Trajectory object');

        // 2. Topology -> Trajectory. Attach the topology reader to the
        //    pre-created Trajectory (not to createDefaultObj's MolCoord) so the
        //    atoms are read onto the Trajectory itself.
        const topoReader = ctx.strMgr.createHandler(
            TOPOLOGY_READER, OBJREADER_CATEGORY,
        ) as unknown as ObjReaderHandle | null;
        if (!topoReader) throw new Error(`topology reader "${TOPOLOGY_READER}" not available`);
        topoReader.setPath(args.topologyPath);
        topoReader.attach(traj);
        topoReader.read();
        topoReader.detach();

        traj.name = args.renderer.objectName || fileStem(args.topologyPath);
        (scene as unknown as SceneHandle).addObject(traj);

        // 3. Trajectory files -> TrajBlocks appended in order.
        for (const trajPath of args.trajPaths) {
            const ext = fileExt(trajPath);
            const nick = TRAJ_READER_BY_EXT[ext];
            if (!nick) throw new Error(`unsupported trajectory format ".${ext}": ${trajPath}`);
            const reader = ctx.strMgr.createHandler(
                nick, OBJREADER_CATEGORY,
            ) as unknown as TrajBlockReaderHandle | null;
            if (!reader) throw new Error(`trajectory reader "${nick}" not available`);
            reader.targTrajUID = traj.uid;
            if (nevery > 1) reader.nevery = nevery;
            const block = reader.createDefaultObj();
            reader.attach(block);
            reader.setPath(trajPath);
            reader.read();
            reader.detach();
            traj.append(block);
        }

        // 4. Initial renderer (Trajectory is MolCoord-derived; reused as-is).
        setupRenderer(ctx, traj, args.renderer);

        return { ok: true, objId: traj.uid };
    });
}

export const services = { loadTrajectory };
