/**
 * @file worker/server/services/getMtzColumnInfo.service.ts
 * @description Read an MTZ file's column labels and resolution range so the
 * file-open dialog can populate amplitude / phase / weight dropdowns. Mirrors
 * the UXP fopen-mtzopt-page onInit path, which calls
 * `reader.getColumnInfoJSON()` and reads `min_res` / `max_res` / `resolution`
 * off a reader that has only parsed the MTZ header.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await). Read-only --
 * the reader only parses the header/footer (no scene mutation), so this is
 * NOT wrapped in an undo txn.
 */
import type { WorkerContext } from '../types/WorkerContext';
import type { MTZ2MapReader } from '@cuemol/core/src/wrappers/MTZ2MapReader';
import { OBJREADER_CATEGORY } from './helpers/pickReaderName';

const log = console;

/** A single MTZ column relevant to map synthesis (F=amplitude, P=phase, W=weight). */
export interface MtzColumn {
    name: string;
    /** MTZ column-type char: 'F' (amplitude), 'P' (phase), 'W' (weight). */
    type: string;
}

export interface GetMtzColumnInfoArgs {
    filePath: string;
}

export interface GetMtzColumnInfoResult {
    ok: boolean;
    /** F / P / W columns only (the types the dialog offers). */
    columns: MtzColumn[];
    /** Lowest-resolution shell in Angstrom (the larger number). */
    minRes: number;
    /** Highest-resolution shell in Angstrom (the smaller number). */
    maxRes: number;
    /** Reader's default resolution limit (== maxRes until overridden). */
    resolution: number;
}

const EMPTY: GetMtzColumnInfoResult = { ok: false, columns: [], minRes: 0, maxRes: 0, resolution: 0 };

const RELEVANT_TYPES = new Set(['F', 'P', 'W']);

function getMtzColumnInfo(ctx: WorkerContext, args: GetMtzColumnInfoArgs): GetMtzColumnInfoResult {
    const reader = ctx.strMgr.createHandler('mtzmap', OBJREADER_CATEGORY) as unknown as MTZ2MapReader | null;
    if (!reader) {
        log.warn('[worker] getMtzColumnInfo: createHandler("mtzmap") failed');
        return EMPTY;
    }

    try {
        reader.setPath(args.filePath);
        // Parses the MTZ header/footer; also populates min_res / max_res /
        // resolution as a side effect (UXP relies on the same ordering).
        const json = reader.getColumnInfoJSON();
        const raw = JSON.parse(json) as Array<{ name: string; type: string }>;
        const columns = raw
            .filter((c) => RELEVANT_TYPES.has(c.type))
            .map((c) => ({ name: c.name, type: c.type }));

        return {
            ok: true,
            columns,
            minRes: reader.min_res,
            maxRes: reader.max_res,
            resolution: reader.resolution,
        };
    } catch (e) {
        log.warn('[worker] getMtzColumnInfo failed:', e);
        return EMPTY;
    }
}

export const services = { getMtzColumnInfo };
