/**
 * @file worker/server/services/helpers/pickReaderName.ts
 * @description Resolve the reader nickname for a file path. Mirrors the C++
 * LoadObjectCommand::guessFileFormat() so the dialog's renderer-type preview
 * (getCompatibleRendererNames) and the actual load (loadObject) resolve to
 * the same reader.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await).
 */
import type { WorkerContext } from '../../types/WorkerContext';
import { DEFAULT_SNIFF_CAP } from '../../../shared/sniffConfig';
import { isHiddenObjReader } from './readerFilter';

export const OBJREADER_CATEGORY = 0;

/**
 * Pick the reader nickname for `filePath`.
 *
 * @param ctx - worker context (uses ctx.strMgr)
 * @param filePath - path of the file to load
 * @param contentFirst - when true, ignore the extension and pick the reader
 *   purely by content-sniffing every registered reader; when false, the
 *   extension narrows the candidate set first and content sniff only
 *   disambiguates when several readers share the extension.
 * @param maxSniffBytes - ceiling of the escalating content-sniff byte
 *   budget (see shared/sniffConfig.ts). Defaults to DEFAULT_SNIFF_CAP;
 *   0 / negative map to the default as well, so tritium never runs the
 *   C++ "no ceiling" mode.
 * @returns the resolved reader nickname, or '' when none matches.
 */
export function pickReaderName(
    ctx: WorkerContext,
    filePath: string,
    contentFirst: boolean,
    maxSniffBytes: number = DEFAULT_SNIFF_CAP,
): string {
    // 0 would mean "no ceiling" on the C++ side; the worker always bounds
    // the scan so a huge undecidable file cannot stall it.
    const cap = maxSniffBytes > 0 ? maxSniffBytes : DEFAULT_SNIFF_CAP;

    // Every user-facing obj reader (internal qdf* readers are never chosen --
    // they would otherwise win a content sniff over the intended reader, e.g.
    // qdfpdb over pdb). Mirrors getOpenFilters' dialog-filter exclusion.
    const infoJson = ctx.strMgr.getInfoJSON2();
    const info: Array<{ name: string; fext: string; category: number }> = JSON.parse(infoJson);
    const objReaders = info.filter(
        (e) => e.category === OBJREADER_CATEGORY && !isHiddenObjReader(e.name),
    );

    if (contentFirst) {
        // Content-first: sniff every user-facing reader's canHandleContent;
        // the first YES wins. Restrict the candidate list to non-qdf readers
        // (passing a CSV instead of '' so the C++ sniff never considers qdf*).
        // The ceiling bounds each candidate's escalating stream scan so
        // pathological inputs can't stall the sniff loop.
        const csv = objReaders.map((e) => e.name).join(',');
        if (!csv) return '';
        return ctx.strMgr.searchReaderByContent(filePath, csv, OBJREADER_CATEGORY, false, cap);
    }

    // Ext-first: collect every user-facing reader whose fext claims this extension.
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const candidates = objReaders
        .filter(
            (e) =>
                e.fext.split(';').map((s) => s.trim().replace(/^\*\./, '').toLowerCase()).includes(ext),
        )
        .map((e) => e.name);

    if (candidates.length === 0) return '';
    if (candidates.length === 1) return candidates[0];

    // Multiple readers share this extension. Disambiguate by content.
    const csv = candidates.join(',');
    const hit = ctx.strMgr.searchReaderByContent(filePath, csv, OBJREADER_CATEGORY, false, cap);
    return hit || candidates[0];
}
