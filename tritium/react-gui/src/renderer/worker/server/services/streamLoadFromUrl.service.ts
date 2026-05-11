// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers),
// but this service is async because it awaits a streaming HTTP fetch and
// feeds chunks into the C++ StreamManager via supplyDataAsync. Mirrors the
// UXP onOpenPDBsite path (uxp_gui/.../tools/netpdbopen.js).
import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { FileOpenOptions } from '../../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';
import { withUndoTxn } from './withUndoTxn';
import { streamFetchToReader, cancelStream } from './helpers/streamFetchToReader';

const log = console;

export interface StreamLoadFromUrlArgs {
    reqId: string;
    url: string;
    readerName: string;     // 'mmcif' | 'pdb' | ...
    objectName: string;     // pdbid (lowercased)
    sceneId: number;
    options: FileOpenOptions;
}

export interface StreamLoadFromUrlResult {
    ok: boolean;
    canceled?: boolean;
}

export interface CancelStreamLoadArgs {
    reqId: string;
}

export interface CancelStreamLoadResult {
    ok: boolean;
}

async function streamLoadFromUrl(
    ctx: WorkerContext,
    args: StreamLoadFromUrlArgs,
): Promise<StreamLoadFromUrlResult> {
    log.info(`[worker] streamLoadFromUrl: reqId=${args.reqId} url=${args.url}`);

    const reader = ctx.strMgr.createHandler(args.readerName, 0) as ObjReader;
    if (!reader) {
        throw new Error(`createHandler failed for reader "${args.readerName}"`);
    }

    const { obj, canceled } = await streamFetchToReader(ctx, {
        reqId: args.reqId,
        url: args.url,
        reader,
    });

    if (canceled) return { ok: false, canceled: true };
    if (!obj) return { ok: false };

    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    return withUndoTxn(scene, 'Get PDB', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any).name = args.objectName;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scene as any).addObject(obj);

        if (args.options.renderer.objectName) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (obj as any).name = args.options.renderer.objectName;
        }
        setupRenderer(ctx, obj, args.options.renderer);
        return { ok: true };
    });
}

function cancelStreamLoad(
    _ctx: WorkerContext,
    args: CancelStreamLoadArgs,
): CancelStreamLoadResult {
    return { ok: cancelStream(args.reqId) };
}

export const services = { streamLoadFromUrl, cancelStreamLoad };
