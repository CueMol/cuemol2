/**
 * @file worker/server/services/file/getCompatibleRendererNames.ts
 * @description Resolves which reader will load a file and which renderer
 * types could draw what that reader produces, for the file-open flow's
 * renderer picker.
 *
 * Runs in the Web Worker thread. Wrappers are sync (no await on C++ wrappers).
 *
 * An empty `types` has two distinct causes, and the caller must tell them
 * apart before it says anything to the user (see `useSceneCommands`'
 * OpenObjByPath handler):
 *
 * - `readerName === ''` -- no reader claims this file. "Unsupported format"
 *   is the honest message.
 * - `readerName !== ''` -- a reader claims it, but nothing can draw the
 *   object it produces. The file is fine and the format is supported; it
 *   just cannot be opened on its own. `objType` says what it would have
 *   built, which is how the caller recognises a `TrajBlock` (a `.dcd` /
 *   `.xtc` / `.trr` / AMBER NetCDF trajectory, openable only together with a
 *   topology) and can point at the flow that does accept it.
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import { pickReaderName, OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName';
import { isInitialRendererType } from '@renderer/worker/server/services/helpers/rendererFilter';

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

/**
 * No reader identified, or the identified one could not be instantiated.
 *
 * The instantiation failures report no `readerName` on purpose: without a
 * temp object there is no `objType`, so the caller cannot say anything more
 * specific than "this file cannot be opened" anyway, and claiming a reader it
 * then knows nothing about would only narrow the message to something it
 * cannot support.
 */
const EMPTY_RESULT: GetCompatibleRendererNamesResult = { types: [], objType: '', readerName: '' };

export function getCompatibleRendererNames(
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
        .filter(isInitialRendererType);

    return { types, objType, readerName };
}
