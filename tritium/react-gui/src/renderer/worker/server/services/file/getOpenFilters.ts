/**
 * @file worker/server/services/file/getOpenFilters.ts
 * @description Builds the Electron file-dialog filter list from the readers
 * registered in the C++ StreamManager.
 *
 * Runs in the Web Worker thread. Wrappers are sync (no await on C++ wrappers).
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import {
    isHiddenObjReader,
    isTrajBlockObjReader,
} from '@renderer/worker/server/services/helpers/readerFilter';

export interface GetOpenFiltersArgs {
    catId: number;
    /**
     * Keep the trajectory-block readers (`*.dcd` / `*.xtc` / `*.trr` / AMBER
     * NetCDF) in the list. Off by default.
     *
     * Those files cannot be opened on their own -- they carry coordinate
     * frames and need a topology -- so the File > Open dialog must not offer
     * them. The drop path asks for them anyway: it classifies a dropped file
     * by testing it against these very filters, and a file missing from the
     * list is reported as "no reader accepts this file", which is untrue and
     * unhelpful. Recognising it lets the open flow say what it actually is.
     *
     * @see isTrajBlockObjReader
     */
    includeTrajReaders?: boolean;
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

/**
 * The filter rows for one handler category, as Electron's open dialog wants
 * them: an "All Supported" union first, one row per handler, "All Files" last.
 *
 * @param args - `catId` is an `InOutHandler::IOH_CAT_*` value; see
 *   {@link GetOpenFiltersArgs.includeTrajReaders} for the trajectory opt-in.
 */
export function getOpenFilters(
    ctx: WorkerContext,
    args: GetOpenFiltersArgs
): FileFilter[] {
    const infoJson = ctx.strMgr.getInfoJSON2();
    const info: Array<{ name: string; descr: string; fext: string; category: number }> =
        JSON.parse(infoJson);
    const items = info.filter(
        (e) =>
            e.category === args.catId &&
            !isHiddenObjReader(e.name) &&
            (args.includeTrajReaders === true || !isTrajBlockObjReader(e.name))
    );
    const allExts = items.flatMap((e) => parseFext(e.fext));
    return [
        { name: 'All Supported', extensions: allExts },
        ...items.map((e) => ({ name: e.descr, extensions: parseFext(e.fext) })),
        { name: 'All Files', extensions: ['*'] },
    ];
}
