/**
 * @file worker/server/services/file/entryInfo.ts
 * @description What Get PDB reads about an entry before downloading it: the
 * RCSB entry record (method, resolution, associated EMDB volumes), the EMDB
 * map record (recommended contour level, file size), and a keyword search
 * for when the user does not know the ID.
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
    parseRcsbSearch,
    rcsbEntriesQuery,
    rcsbSearchRequest,
    type EmdbMapInfo,
    type EntryInfo,
    type SearchMethodFilter,
    type SearchSort,
} from '@renderer/worker/shared/pdbEntryInfo';

const RCSB_GRAPHQL_URL = 'https://data.rcsb.org/graphql';
const EMDB_API_URL = 'https://www.ebi.ac.uk/emdb/api/entry';
const RCSB_SEARCH_URL = 'https://search.rcsb.org/rcsbsearch/v2/query';

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

export interface SearchPdbEntriesArgs {
    /** Free text, as typed. */
    query: string;
    method: SearchMethodFilter;
    sort: SearchSort;
    /** Index of the first hit to return (for paging). */
    start: number;
    rows: number;
}

/** The total hit count, and the entries of this page in rank order. */
export type SearchPdbEntriesResult = Result<{ total: number; entries: EntryInfo[] }>;

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
        return await queryEntries(args.pdbIds);
    } catch (e) {
        return failFrom(e, 'io');
    }
}

/** RCSB entry records of `ids`, as a Result. */
async function queryEntries(ids: string[]): Promise<Result<{ entries: EntryInfo[] }>> {
    const resp = await fetch(RCSB_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: rcsbEntriesQuery(ids) }),
    });
    if (!resp.ok) return fail(`HTTP ${resp.status} from RCSB`, 'io');
    return ok({ entries: parseRcsbEntries(await resp.json()) });
}

/**
 * Full-text search of the PDB, then the entry records of the hits on this
 * page, so the result list shows title, method and resolution per row.
 *
 * @returns the hit count and this page's entries in rank order; a search
 *   with no hits is a success with none (RCSB answers it with 204)
 */
export async function searchPdbEntries(
    _ctx: WorkerContext,
    args: SearchPdbEntriesArgs,
): Promise<SearchPdbEntriesResult> {
    const query = args.query.trim();
    if (query.length === 0) return ok({ total: 0, entries: [] });
    try {
        const resp = await fetch(RCSB_SEARCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rcsbSearchRequest(query, args.method, args.sort, args.start, args.rows)),
        });
        if (resp.status === 204) return ok({ total: 0, entries: [] });
        if (!resp.ok) return fail(`HTTP ${resp.status} from RCSB search`, 'io');
        const { total, ids } = parseRcsbSearch(await resp.json());
        if (ids.length === 0) return ok({ total, entries: [] });
        const res = await queryEntries(ids);
        if (!res.ok) return res;
        const byId = new Map(res.entries.map((e) => [e.id, e]));
        const entries = ids.map((id) => byId.get(id)).filter((e): e is EntryInfo => e !== undefined);
        return ok({ total, entries });
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
