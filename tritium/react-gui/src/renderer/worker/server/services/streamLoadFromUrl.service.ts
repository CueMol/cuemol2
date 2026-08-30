// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers),
// but this service is async because it awaits a streaming HTTP fetch and
// feeds chunks into the C++ StreamManager via supplyDataAsync. Mirrors the
// UXP onOpenPDBsite path (uxp_gui/.../tools/netpdbopen.js).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { FileOpenOptions } from '@renderer/worker/shared/fileOpenTypes';
import { setupRenderer } from './setupRenderer.service';
import { undoTxnResult } from './withUndoTxn';
import { streamFetchToReader, cancelStream } from '@renderer/worker/server/services/helpers/streamFetchToReader';
import { applyReaderOptions } from '@renderer/worker/server/services/helpers/applyReaderOptions';
import { fail, failFrom, ok, type Result } from '@renderer/worker/shared/result';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';

const log = console;

export interface StreamLoadFromUrlArgs {
    reqId: string;
    url: string;
    readerName: string;     // 'mmcif' | 'pdb' | ...
    objectName: string;     // pdbid (lowercased)
    sceneId: number;
    options: FileOpenOptions;
}

/** `{ objId }` on success; a cancel is `fail(..., 'canceled')`. */
export type StreamLoadFromUrlResult = Result<{ objId: number }>;

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
        return fail(`createHandler failed for reader "${args.readerName}"`, 'unsupported');
    }

    // Wire the dialog's format-specific reader options before streaming, the
    // same way the local file-open path does (readerName is the nickname).
    applyReaderOptions(reader, args.readerName, args.options.format);

    let fetched: Awaited<ReturnType<typeof streamFetchToReader>>;
    try {
        fetched = await streamFetchToReader(ctx, { reqId: args.reqId, url: args.url, reader });
    } catch (e) {
        // HTTP error. The helper throws so its own cleanup runs on every path;
        // it is converted here, at the service boundary.
        return failFrom(e, 'io');
    }
    const { obj, canceled } = fetched;

    if (canceled) return fail('download canceled', 'canceled');
    if (!obj) return fail('the reader produced no object', 'io');

    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found');
    return undoTxnResult(scene, 'Get PDB', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any).name = args.objectName;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scene as any).addObject(obj);

        if (args.options.renderer.objectName) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (obj as any).name = args.options.renderer.objectName;
        }
        setupRenderer(ctx, obj, args.options.renderer);
        return ok({ objId: (obj as unknown as { uid: number }).uid });
    });
}

function cancelStreamLoad(
    _ctx: WorkerContext,
    args: CancelStreamLoadArgs,
): CancelStreamLoadResult {
    return { ok: cancelStream(args.reqId) };
}

export const services = { streamLoadFromUrl, cancelStreamLoad };
