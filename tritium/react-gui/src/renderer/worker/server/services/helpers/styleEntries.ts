/**
 * @file worker/server/services/helpers/styleEntries.ts
 * @description Shared parser for `StyleManager.getStyleNamesJSON` output,
 * used by the renderer Style (shape) and Coloring / Paint context-menu
 * services.
 *
 * Runs in the Web Worker thread; the StyleManager wrapper is called
 * synchronously. The loose `styleSetEdit` service has its own cousin parser
 * with a different result shape and is intentionally not consolidated here.
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

/** One entry of the `StyleManager.getStyleNamesJSON` array (all fields optional). */
export interface RawStyleEntry {
    name?: string;
    desc?: string;
    type?: string;
}

/**
 * Parse `StyleManager.getStyleNamesJSON` for a scope into raw style entries.
 *
 * The JSON lists every style set of the scope, newest first, so a style
 * redefined by a later set (cuemol3_style.xml over default_style.xml, or a
 * user style file) appears once per set. Only its last entry is kept: the one
 * from the set that defines it in full, at its place in that set's order.
 *
 * @param ctx - worker context (provides `styleMgr`)
 * @param sceneId - scope id (0 for the global style set, a scene uid for local)
 * @returns the parsed entries, or `[]` on any error (null/empty JSON,
 *   malformed JSON, or a non-array payload)
 */
export function fetchStyleEntries(ctx: WorkerContext, sceneId: number): RawStyleEntry[] {
    try {
        const json = ctx.styleMgr.getStyleNamesJSON(sceneId);
        if (!json) return [];
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) return [];
        const entries = parsed as RawStyleEntry[];
        const lastIndex = new Map<string | undefined, number>();
        entries.forEach((e, i) => lastIndex.set(e.name, i));
        return entries.filter((e, i) => e.name === undefined || lastIndex.get(e.name) === i);
    } catch {
        return [];
    }
}
