// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';

const RENDERER_TEST_TYPES = new Set(['ms2test', 'symm']);

export interface GetCompatibleRendererNamesArgs {
    filePath: string;
    /**
     * Optional explicit reader name (e.g. 'mmcif', 'pdb'). When provided,
     * skip the extension-based reader lookup. This avoids the .cif
     * ambiguity where the mmcif coordinate reader and the mmcifmap
     * structure-factor reader both register the .cif extension; in that
     * case the JSON-order first hit wins. Get PDB uses this because it
     * picks the reader by server type, not by extension.
     */
    readerName?: string;
}

function getCompatibleRendererNames(
    ctx: WorkerContext,
    args: GetCompatibleRendererNamesArgs
): string[] {
    let readerName: string;
    if (args.readerName) {
        readerName = args.readerName;
    } else {
        const infoJson = ctx.strMgr.getInfoJSON2();
        const info: Array<{ name: string; fext: string; category: number }> = JSON.parse(infoJson);

        const ext = args.filePath.split('.').pop()?.toLowerCase() ?? '';
        const readerEntry = info.find(
            (e) => e.category === 0 &&
                e.fext.split(';').map((s) => s.trim().replace(/^\*\./, '').toLowerCase()).includes(ext)
        );
        if (!readerEntry) return [];
        readerName = readerEntry.name;
    }

    const reader = ctx.strMgr.createHandler(readerName, 0) as ObjReader;
    if (!reader) return [];
    reader.setPath(args.filePath);

    const tmpObj = reader.createDefaultObj();
    if (!tmpObj) return [];

    const rendTypesStr = tmpObj.searchCompatibleRendererNames();
    if (!rendTypesStr) return [];

    return rendTypesStr
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.charAt(0) !== '*' && !RENDERER_TEST_TYPES.has(s));
}

export const services = { getCompatibleRendererNames };
