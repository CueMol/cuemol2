/**
 * @file worker/server/services/probeMapHeader.service.ts
 * @description Read only the header of a CCP4/MRC map file
 * (CCP4MapReader.probeHeader) so the file-open dialog can show the map size
 * and warn about a very large map before the whole file is read.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await).
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { LARGE_MAP_VOXELS, suggestSubsample, type MapHeaderInfo } from '@renderer/worker/shared/mapHeader';
export { LARGE_MAP_VOXELS, suggestSubsample };
export type { MapHeaderInfo };
import { OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName';

const log = console;

export interface ProbeMapHeaderArgs {
    filePath: string;
}

export interface ProbeMapHeaderResult {
    ok: boolean;
    info: MapHeaderInfo | null;
}

function probeMapHeader(ctx: WorkerContext, args: ProbeMapHeaderArgs): ProbeMapHeaderResult {
    const reader = ctx.strMgr.createHandler('ccp4map', OBJREADER_CATEGORY) as unknown as
        | { probeHeader?: (path: string) => string }
        | null;
    if (!reader || typeof reader.probeHeader !== 'function') {
        log.warn('[worker] probeMapHeader: ccp4map reader unavailable');
        return { ok: false, info: null };
    }
    try {
        const raw = JSON.parse(reader.probeHeader(args.filePath)) as Record<string, unknown>;
        const num = (k: string) => Number(raw[k]);
        const origin = Array.isArray(raw.origin) ? (raw.origin as number[]) : [0, 0, 0];
        return {
            ok: true,
            info: {
                nc: num('nc'),
                nr: num('nr'),
                ns: num('ns'),
                mode: num('mode'),
                supported: raw.supported === true,
                nvoxels: num('nvoxels'),
                storageBytes: num('storage_bytes'),
                ispg: num('ispg'),
                nversion: num('nversion'),
                exttyp: String(raw.exttyp ?? ''),
                origin: [Number(origin[0] ?? 0), Number(origin[1] ?? 0), Number(origin[2] ?? 0)],
                dmin: num('dmin'),
                dmax: num('dmax'),
                dmean: num('dmean'),
                rms: num('rms'),
            },
        };
    } catch (e) {
        log.warn('[worker] probeMapHeader failed:', e);
        return { ok: false, info: null };
    }
}

export const services = { probeMapHeader };
