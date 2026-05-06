// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';

export interface GetOpenFiltersArgs {
    catId: number;
}

interface FileFilter {
    name: string;
    extensions: string[];
}

function parseFext(fext: string): string[] {
    return fext
        .split(';')
        .map((e) => e.trim().replace(/^\*\./, ''))
        .filter((e) => e !== '' && e !== '*');
}

function getOpenFilters(
    ctx: WorkerContext,
    args: GetOpenFiltersArgs
): FileFilter[] {
    const infoJson = ctx.strMgr.getInfoJSON2();
    const info: Array<{ name: string; descr: string; fext: string; category: number }> =
        JSON.parse(infoJson);
    const items = info.filter((e) => e.category === args.catId && e.name.indexOf('qdf') !== 0);
    const allExts = items.flatMap((e) => parseFext(e.fext));
    return [
        { name: 'All Supported', extensions: allExts },
        ...items.map((e) => ({ name: e.descr, extensions: parseFext(e.fext) })),
        { name: 'All Files', extensions: ['*'] },
    ];
}

export const services = { getOpenFilters };
