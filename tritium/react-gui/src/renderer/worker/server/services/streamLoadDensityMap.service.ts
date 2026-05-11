// Runs in Web Worker thread. Streaming download of an electron density map
// from RCSB validation reports (cif.gz / mmcifmap reader) or EBI PDBe
// (.mtz / mtzmap reader). Mirrors UXP openMapImpl + netpdbopen.js
// (uxp_gui/cuemol2/base/content/tools/netpdbopen.js, L329-428).

import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { DensityMap } from '@cuemol/core/src/wrappers/DensityMap';
import { setupDensityMapRenderers, type DensityMapType } from './helpers/setupDensityMapRenderers';
import { withUndoTxn } from './withUndoTxn';
import { streamFetchToReader } from './helpers/streamFetchToReader';

const log = console;

export type DensityMapReaderName = 'mmcifmap' | 'mtzmap';

export interface StreamLoadDensityMapArgs {
    reqId: string;
    url: string;
    readerName: DensityMapReaderName;
    /** True for .cif.gz from RCSB validation_reports; false for raw .mtz. */
    gzip: boolean;
    mapType: DensityMapType;
    /** Object name to assign after load (e.g. '1mbn_2fofc'). */
    objectName: string;
    sceneId: number;
    viewId: number;
}

export interface StreamLoadDensityMapResult {
    ok: boolean;
    canceled?: boolean;
}

// Shared grid spacing used by UXP for both mmcifmap and mtzmap downloads.
const DEFAULT_GRID_SIZE = 0.25;

function configureMtzColumns(
    reader: ObjReader,
    mapType: DensityMapType,
): void {
    // 2Fo-Fc → FWT/PHWT, Fo-Fc → DELFWT/PHDELWT (UXP openMapImpl L350-359).
    // The wrapper types these as numbers (enum) but the C++ runtime expects
    // strings; cast through unknown per CLAUDE.md "Auto-generated wrapper
    // enum properties" rule.
    const r = reader as unknown as { clmn_F: string; clmn_PHI: string };
    if (mapType === '2fofc') {
        r.clmn_F = 'FWT';
        r.clmn_PHI = 'PHWT';
    } else {
        r.clmn_F = 'DELFWT';
        r.clmn_PHI = 'PHDELWT';
    }
}

async function streamLoadDensityMap(
    ctx: WorkerContext,
    args: StreamLoadDensityMapArgs,
): Promise<StreamLoadDensityMapResult> {
    log.info(`[worker] streamLoadDensityMap: reqId=${args.reqId} url=${args.url} mapType=${args.mapType}`);

    const reader = ctx.strMgr.createHandler(args.readerName, 0) as ObjReader;
    if (!reader) {
        throw new Error(`createHandler failed for reader "${args.readerName}"`);
    }

    // Reader configuration (mirrors UXP openMapImpl L334-360).
    if (args.gzip) {
        // compress is enum-typed in the wrapper but accepts strings at runtime.
        (reader as unknown as { compress: string }).compress = 'gzip';
    }
    if (args.readerName === 'mtzmap') {
        configureMtzColumns(reader, args.mapType);
    }
    (reader as unknown as { gridsize: number }).gridsize = DEFAULT_GRID_SIZE;

    const { obj, canceled } = await streamFetchToReader(ctx, {
        reqId: args.reqId,
        url: args.url,
        reader,
    });

    if (canceled) return { ok: false, canceled: true };
    if (!obj) return { ok: false };

    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;

    return withUndoTxn(scene, 'Get density map', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any).name = args.objectName;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scene as any).addObject(obj);

        setupDensityMapRenderers(ctx, scene, obj, args.mapType);

        // Center view on the new map (UXP renderer.js L196-198).
        // fitView is on DensityMap; obj is typed as Object so cast.
        (obj as unknown as DensityMap).fitView(view, false);

        return { ok: true };
    });
}

export const services = { streamLoadDensityMap };
