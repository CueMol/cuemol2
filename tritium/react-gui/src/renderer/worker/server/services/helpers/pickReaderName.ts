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
 * @param maxSniffBytes - upper bound on bytes each reader's canHandleContent
 *   may consume during sniff. Defaults to DEFAULT_SNIFF_CAP.
 * @returns the resolved reader nickname, or '' when none matches.
 */
export function pickReaderName(
    ctx: WorkerContext,
    filePath: string,
    contentFirst: boolean,
    maxSniffBytes: number = DEFAULT_SNIFF_CAP,
): string {
    const cap = maxSniffBytes > 0 ? maxSniffBytes : DEFAULT_SNIFF_CAP;
    if (contentFirst) {
        // Pure content-first: every registered reader's canHandleContent
        // runs; the first YES wins. Returns '' when nothing claims it.
        // The cap bounds each candidate's stream scan so pathological
        // inputs can't stall the sniff loop.
        return ctx.strMgr.searchReaderByContent(filePath, '', OBJREADER_CATEGORY, false, cap);
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
    const hit = ctx.strMgr.searchReaderByContent(filePath, csv, OBJREADER_CATEGORY, false, cap);
    return hit || candidates[0];
}
