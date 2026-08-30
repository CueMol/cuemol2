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
        return parsed as RawStyleEntry[];
    } catch {
        return [];
    }
}
