/**
 * @file worker/server/services/getReaderDefaultOptions.service.ts
 * @description Read an ObjReader's option-property default values straight off
 * a freshly created handler, so the file-open dialog can initialise its
 * format-specific option panes from the C++ reader (qif `default` / constructor
 * member initialisers) instead of hardcoding the defaults on the TS side.
 *
 * This is the worker-side equivalent of the UXP `fopen-*opt-page` `onInit`
 * handlers, which read `rdr.<prop>` to seed the dialog widgets
 * (e.g. uxp_gui/cuemol2/base/content/fopen-pdbopt-page.xul reads
 * `rdr.autoTopoGen`, fopen-ccp4map-page.xul reads `rdr.normalize`). The reader
 * is the single source of truth for option defaults.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await). Read-only: the
 * handler is created but never `read()`s a file (the constructor already set
 * the defaults), so there is no scene mutation and no undo txn.
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName';

const log = console;

export interface GetReaderDefaultOptionsArgs {
    /** Resolved reader nickname (pdb / mmcif / ccp4map / ...). */
    nickname: string;
}

/**
 * Reader-backed option defaults, keyed by the reader property name. Only the
 * subset relevant to the requested nickname is populated; readers without
 * dialog-exposed value options return an empty object.
 */
export interface ReaderDefaultOptions {
    // pdb / mmcif
    loadmodel?: boolean;
    loadanisou?: boolean;
    loadaltconf?: boolean;
    loadsegid?: boolean;
    build2ndry?: boolean;
    loadsecstr?: boolean;
    autoTopoGen?: boolean;
    // ccp4map
    normalize?: boolean;
    truncate_min?: boolean;
    min?: number;
    truncate_max?: boolean;
    max?: number;
    subsample?: number;
}

export interface GetReaderDefaultOptionsResult {
    ok: boolean;
    values: ReaderDefaultOptions;
}

// Reader property names to read per nickname. Keep in sync with the dialog
// option panes and applyReaderOptions.ts wiring.
const PROPS_BY_NICKNAME: Record<string, readonly (keyof ReaderDefaultOptions)[]> = {
    pdb: ['loadmodel', 'loadanisou', 'loadaltconf', 'loadsegid', 'build2ndry', 'autoTopoGen'],
    mmcif: ['loadmodel', 'loadanisou', 'loadaltconf', 'loadsecstr', 'autoTopoGen'],
    ccp4map: ['normalize', 'truncate_min', 'min', 'truncate_max', 'max', 'subsample'],
};

function getReaderDefaultOptions(
    ctx: WorkerContext,
    args: GetReaderDefaultOptionsArgs,
): GetReaderDefaultOptionsResult {
    const props = PROPS_BY_NICKNAME[args.nickname];
    if (!props) {
        // Reader without dialog-exposed value options (msms / namdcoor / ...).
        return { ok: true, values: {} };
    }

    const reader = ctx.strMgr.createHandler(args.nickname, OBJREADER_CATEGORY) as unknown as
        | Record<string, unknown>
        | null;
    if (!reader) {
        log.warn(`[worker] getReaderDefaultOptions: createHandler failed for "${args.nickname}"`);
        return { ok: false, values: {} };
    }

    try {
        const values: ReaderDefaultOptions = {};
        for (const p of props) {
            (values as Record<string, unknown>)[p] = reader[p];
        }
        return { ok: true, values };
    } catch (e) {
        log.warn('[worker] getReaderDefaultOptions failed:', e);
        return { ok: false, values: {} };
    }
}

export const services = { getReaderDefaultOptions };
