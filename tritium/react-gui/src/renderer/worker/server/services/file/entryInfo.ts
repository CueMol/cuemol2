/**
 * @file worker/server/services/file/entryInfo.ts
 * @description What Get PDB reads about an entry before downloading it: the
 * RCSB entry record (method, resolution, associated EMDB volumes) and the
 * EMDB map record (recommended contour level, file size).
 *
 * Runs in the Web Worker thread. Both are plain HTTPS fetches (RCSB and EMDB
 * answer with `Access-Control-Allow-Origin: *`); the parsing rules live in
 * `worker/shared/pdbEntryInfo.ts`.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { fail, failFrom, ok, type Result } from '@renderer/worker/shared/result';
import {
    parseEmdbMap,
    parseRcsbEntries,
    rcsbEntriesQuery,
    type EmdbMapInfo,
    type EntryInfo,
} from '@renderer/worker/shared/pdbEntryInfo';

const RCSB_GRAPHQL_URL = 'https://data.rcsb.org/graphql';
const EMDB_API_URL = 'https://www.ebi.ac.uk/emdb/api/entry';

export interface FetchEntryInfoArgs {
    /** PDB IDs, in any case. */
    pdbIds: string[];
}

/** The entries RCSB knows, in the order it returns them; unknown IDs are absent. */
export type FetchEntryInfoResult = Result<{ entries: EntryInfo[] }>;

export interface FetchEmdbMapInfoArgs {
    /** `EMD-<num>`. */
    emdbId: string;
}

export type FetchEmdbMapInfoResult = Result<{ info: EmdbMapInfo }>;

/**
 * Read the RCSB entry records of `pdbIds` in one GraphQL request.
 *
 * @returns the parsed entries, or `io` on a network or HTTP failure
 */
export async function fetchEntryInfo(
    _ctx: WorkerContext,
    args: FetchEntryInfoArgs,
): Promise<FetchEntryInfoResult> {
    if (args.pdbIds.length === 0) return ok({ entries: [] });
    try {
        const resp = await fetch(RCSB_GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: rcsbEntriesQuery(args.pdbIds) }),
        });
        if (!resp.ok) return fail(`HTTP ${resp.status} from RCSB`, 'io');
        return ok({ entries: parseRcsbEntries(await resp.json()) });
    } catch (e) {
        return failFrom(e, 'io');
    }
}

/**
 * Read the EMDB map record of `emdbId`, and its title from the admin record.
 * A missing admin record only leaves the title empty.
 *
 * @returns the parsed map info, `not-found` when EMDB has no such entry
 */
export async function fetchEmdbMapInfo(
    _ctx: WorkerContext,
    args: FetchEmdbMapInfoArgs,
): Promise<FetchEmdbMapInfoResult> {
    const id = encodeURIComponent(args.emdbId.toUpperCase());
    try {
        const [mapResp, adminJson] = await Promise.all([
            fetch(`${EMDB_API_URL}/map/${id}`),
            fetch(`${EMDB_API_URL}/admin/${id}`)
                .then((r) => (r.ok ? r.json() : undefined))
                .catch(() => undefined),
        ]);
        if (mapResp.status === 404) return fail(`${args.emdbId} not found`, 'not-found');
        if (!mapResp.ok) return fail(`HTTP ${mapResp.status} from EMDB`, 'io');
        return ok({ info: parseEmdbMap(args.emdbId.toUpperCase(), await mapResp.json(), adminJson) });
    } catch (e) {
        return failFrom(e, 'io');
    }
}
