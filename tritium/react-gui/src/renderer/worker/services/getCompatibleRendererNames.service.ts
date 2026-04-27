import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';

const RENDERER_TEST_TYPES = new Set(['ms2test', 'symm']);

export const name = 'getCompatibleRendererNames';

export interface GetCompatibleRendererNamesArgs {
    filePath: string;
}

export default function getCompatibleRendererNames(
    ctx: WorkerContext,
    args: GetCompatibleRendererNamesArgs
): string[] {
    const infoJson = ctx.strMgr.getInfoJSON2();
    const info: Array<{ name: string; fext: string; category: number }> = JSON.parse(infoJson);

    const ext = args.filePath.split('.').pop()?.toLowerCase() ?? '';
    const readerEntry = info.find(
        (e) => e.category === 0 &&
            e.fext.split(';').map((s) => s.trim().replace(/^\*\./, '').toLowerCase()).includes(ext)
    );
    if (!readerEntry) return [];

    const reader = ctx.strMgr.createHandler(readerEntry.name, 0) as ObjReader;
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
