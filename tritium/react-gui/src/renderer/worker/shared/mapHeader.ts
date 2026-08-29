/**
 * @file worker/shared/mapHeader.ts
 * @description Density-map header facts and the subsampling rule derived from
 * them.
 *
 * The worker probes the header; the File Open dialog shows the numbers and
 * offers the same subsample suggestion, so the rule has to be one piece of
 * code both threads can read. It used to live in the service, which made the
 * dialog import a worker module at RUNTIME -- the renderer bundle then pulled
 * in worker code that expects `fs` / `os`.
 */

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
