// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import { DEFAULT_SNIFF_CAP } from '../../shared/sniffConfig';

const log = console;
const RENDERER_TEST_TYPES = new Set(['ms2test', 'symm']);
const OBJREADER_CATEGORY = 0;

export interface GetCompatibleRendererNamesArgs {
    filePath: string;
    /**
     * Optional explicit reader name (e.g. 'mmcif', 'pdb'). When provided,
     * skip the extension / content lookup. Get PDB uses this because it
     * picks the reader by server type, not by the file's path.
     */
    readerName?: string;
    /**
     * Mirrors LoadObjectCommand's `content_first` flag. When true, the
     * reader is chosen purely by content sniffing every registered
     * reader (extension is ignored). When false / undefined (default),
     * the extension narrows the candidate set first; if several readers
     * share the extension, content sniff disambiguates among them.
     *
     * Must match the value passed to `loadObject()` so the dialog's
     * renderer-type list reflects the reader that will actually load
     * the file.
     */
    contentFirst?: boolean;
}

export interface GetCompatibleRendererNamesResult {
    types: string[];
    /**
     * C++ class name of the temp object created by the reader
     * (e.g. 'MolCoord', 'DensityMap'). Used as a history key for the
     * "remember last-used renderer type per object kind" feature in
     * FileOpenOptionDialog. Empty string when not available.
     */
    objType: string;
}

const EMPTY_RESULT: GetCompatibleRendererNamesResult = { types: [], objType: '' };

/**
 * Pick the reader nickname for `filePath`. Mirrors the C++
 * LoadObjectCommand::guessFileFormat() so this lookup and the actual
 * load resolve to the same reader.
 */
function pickReaderName(
    ctx: WorkerContext,
    filePath: string,
    contentFirst: boolean,
): string {
    if (contentFirst) {
        // Pure content-first: every registered reader's canHandleContent
        // runs; the first YES wins. Returns '' when nothing claims it.
        // maxBytes=0 means unbounded -- readers scan their stream until
        // a verdict or EOF. The UI layer doesn't need a cap for the
        // disambiguation step (real files break out within a few KB).
        return ctx.strMgr.searchReaderByContent(filePath, '', OBJREADER_CATEGORY, false, DEFAULT_SNIFF_CAP);
    }

    // Ext-first: collect every reader whose fext claims this extension.
    const infoJson = ctx.strMgr.getInfoJSON2();
    const info: Array<{ name: string; fext: string; category: number }> = JSON.parse(infoJson);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const candidates = info
        .filter(
            (e) =>
                e.category === OBJREADER_CATEGORY &&
                e.fext.split(';').map((s) => s.trim().replace(/^\*\./, '').toLowerCase()).includes(ext),
        )
        .map((e) => e.name);

    if (candidates.length === 0) return '';
    if (candidates.length === 1) return candidates[0];

    // Multiple readers share this extension. Disambiguate by content.
    const csv = candidates.join(',');
    const hit = ctx.strMgr.searchReaderByContent(filePath, csv, OBJREADER_CATEGORY, false, DEFAULT_SNIFF_CAP);
    return hit || candidates[0];
}

function getCompatibleRendererNames(
    ctx: WorkerContext,
    args: GetCompatibleRendererNamesArgs
): GetCompatibleRendererNamesResult {
    const readerName = args.readerName ?? pickReaderName(ctx, args.filePath, args.contentFirst ?? false);
    log.info(`[getCompatibleRendererNames] path=${args.filePath} contentFirst=${args.contentFirst ?? false} picked="${readerName}"`);
    if (!readerName) return EMPTY_RESULT;

    const reader = ctx.strMgr.createHandler(readerName, OBJREADER_CATEGORY) as ObjReader;
    if (!reader) return EMPTY_RESULT;
    reader.setPath(args.filePath);

    const tmpObj = reader.createDefaultObj();
    if (!tmpObj) return EMPTY_RESULT;

    const objType = (tmpObj as any).getClassName?.() ?? '';

    const rendTypesStr = tmpObj.searchCompatibleRendererNames();
    if (!rendTypesStr) return { types: [], objType };

    const types = rendTypesStr
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.charAt(0) !== '*' && !RENDERER_TEST_TYPES.has(s));

    return { types, objType };
}

export const services = { getCompatibleRendererNames };
