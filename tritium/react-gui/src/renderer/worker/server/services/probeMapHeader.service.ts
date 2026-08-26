/**
 * @file worker/server/services/probeMapHeader.service.ts
 * @description Read only the header of a CCP4/MRC map file
 * (CCP4MapReader.probeHeader) so the file-open dialog can show the map size
 * and warn about a very large map before the whole file is read.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await).
 */
import type { WorkerContext } from '../types/WorkerContext';
import { OBJREADER_CATEGORY } from './helpers/pickReaderName';

const log = console;

export interface ProbeMapHeaderArgs {
    filePath: string;
}

/** Parsed subset of the CCP4MapReader.probeHeader JSON. */
export interface MapHeaderInfo {
    nc: number;
    nr: number;
    ns: number;
    mode: number;
    supported: boolean;
    nvoxels: number;
    /** bytes of the 8-bit map storage at subsample 1 (= nvoxels) */
    storageBytes: number;
    ispg: number;
    nversion: number;
    exttyp: string;
    origin: [number, number, number];
    dmin: number;
    dmax: number;
    dmean: number;
    rms: number;
}

export interface ProbeMapHeaderResult {
    ok: boolean;
    info: MapHeaderInfo | null;
}

/**
 * Voxel count above which the dialog warns about the map size (ChimeraX's
 * voxel_limit_for_open, 256 Mvoxel).
 */
export const LARGE_MAP_VOXELS = 256 * 1024 * 1024;

/**
 * Smallest power-of-two subsample that keeps the stored voxel count under
 * LARGE_MAP_VOXELS (1 when the map is already under it).
 */
export function suggestSubsample(nvoxels: number): number {
    let n = 1;
    while (nvoxels / (n * n * n) > LARGE_MAP_VOXELS && n < 8) n *= 2;
    return n;
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
