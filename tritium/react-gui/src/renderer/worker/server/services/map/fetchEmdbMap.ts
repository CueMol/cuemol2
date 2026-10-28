// Runs in Web Worker thread. Fetch a cryo-EM map from EMDB without a dialog
// in front of it: the op catalog's fetch_emdb and the PyMOL console's
// `fetch EMD-xxxx` both come here. The Get PDB dialog reads the EMDB record
// itself (to show it) and calls streamLoadDensityMap directly.

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { fetchEmdbMapInfo, fetchEntryInfo } from '@renderer/worker/server/services/file/entryInfo';
import { fail, type Result } from '@renderer/worker/shared/result';
import { parseAccession, pickEmdbMapUrl, type EmdbServerType } from '@renderer/worker/shared/pdbUrls';
import { streamLoadDensityMap } from './streamLoad';

export interface FetchEmdbMapArgs {
    reqId: string;
    /** `EMD-<num>` (any spelling `parseAccession` takes), or bare digits. */
    emdbId: string;
    server: EmdbServerType;
    /** Object name; absent uses `emd_<num>`. */
    objectName?: string;
    /** Absolute contour level; absent or null reads the recommended one from EMDB. */
    contourLevel?: number | null;
    sceneId: number;
    viewId: number;
}

/** The new map object, and the canonical ID it was fetched as. */
export type FetchEmdbMapResult = Result<{ objId: number; emdbId: string }>;

/** `EMD-<num>` for any spelling of an EMDB code, or for bare digits. */
export function canonicalEmdbId(text: string): string | null {
    const t = text.trim();
    if (/^\d{4,}$/.test(t)) return `EMD-${t}`;
    const acc = parseAccession(t);
    return acc?.kind === 'emdb' ? acc.id : null;
}

/**
 * The EMDB code to fetch for `id`: the code itself, or the primary map of a
 * cryo-EM PDB entry.
 *
 * @returns the canonical `EMD-<num>`, or a failure naming why there is none
 */
export async function resolveEmdbId(ctx: WorkerContext, id: string): Promise<Result<{ emdbId: string }>> {
    const direct = canonicalEmdbId(id);
    if (direct) return { ok: true, emdbId: direct };
    const acc = parseAccession(id);
    if (acc?.kind !== 'pdb') return fail(`"${id}" is neither an EMDB code (EMD-1234) nor a PDB ID`, 'invalid-args');
    const res = await fetchEntryInfo(ctx, { pdbIds: [acc.id] });
    if (!res.ok) return res;
    const entry = res.entries.find((e) => e.id === acc.id);
    if (!entry) return fail(`no PDB entry ${acc.id.toUpperCase()}`, 'not-found');
    if (entry.emdbIds.length === 0) return fail(`${acc.id.toUpperCase()} has no EMDB map (not a cryo-EM entry)`, 'not-found');
    return { ok: true, emdbId: entry.emdbIds[0] };
}

/**
 * Download the primary map of an EMDB entry into the scene, drawn as the
 * Get PDB dialog draws it (one cryo-EM isosurface at the recommended level).
 * A failed read of the EMDB record only loses the recommended level.
 */
export async function fetchEmdbMap(ctx: WorkerContext, args: FetchEmdbMapArgs): Promise<FetchEmdbMapResult> {
    const emdbId = canonicalEmdbId(args.emdbId);
    if (!emdbId) return fail(`"${args.emdbId}" is not an EMDB code (EMD-1234)`, 'invalid-args');
    const num = emdbId.slice('EMD-'.length);

    let level = args.contourLevel ?? null;
    if (level === null) {
        const info = await fetchEmdbMapInfo(ctx, { emdbId });
        if (!info.ok && info.code === 'not-found') return info;
        if (info.ok) level = info.info.recommendedLevel;
    }

    const spec = pickEmdbMapUrl(num, args.server);
    const res = await streamLoadDensityMap(ctx, {
        reqId: args.reqId,
        url: spec.url,
        readerName: spec.readerName,
        gzip: spec.gzip,
        mapType: 'em',
        objectName: args.objectName ?? `emd_${num}`,
        contourLevel: level,
        sceneId: args.sceneId,
        viewId: args.viewId,
    });
    if (!res.ok) return res;
    return { ok: true, objId: res.objId, emdbId };
}
