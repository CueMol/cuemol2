// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import { pickReaderName, OBJREADER_CATEGORY } from './helpers/pickReaderName';
import { isSelectableRendererType } from './helpers/rendererFilter';

const log = console;

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
    /**
     * The reader nickname C++ resolved for this file (e.g. 'pdb', 'mtzmap').
     * This is the single source of truth for which reader will load the file,
     * and the dialog uses it to pick the format-specific option pane (mirrors
     * UXP `selectShowTab(reader_name, ...)`). Empty string when no reader
     * matched.
     */
    readerName: string;
}

const EMPTY_RESULT: GetCompatibleRendererNamesResult = { types: [], objType: '', readerName: '' };

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
    if (!rendTypesStr) return { types: [], objType, readerName };

    const types = rendTypesStr
        .split(',')
        .map((s: string) => s.trim())
        .filter(isSelectableRendererType);

    return { types, objType, readerName };
}

export const services = { getCompatibleRendererNames };
