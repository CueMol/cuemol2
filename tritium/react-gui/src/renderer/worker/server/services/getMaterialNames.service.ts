// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns the material names available to a renderer's "Material" selector in
// the renderer-common property page. Mirrors UXP `populateMatList`
// (renderer-common-page.js): scene-level material defs first, then global
// defs, de-duplicated. The "(none)" entry is prepended on the UI side.

import type { WorkerContext } from '../types/WorkerContext';

export interface GetMaterialNamesArgs {
    /** Scene scope; 0 (or falsy) limits the query to global defs. */
    sceneId: number;
}

export interface GetMaterialNamesResult {
    /** Material names, scene-local first then global, de-duplicated. */
    names: string[];
}

function parseNames(json: string): string[] {
    try {
        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
        return [];
    }
}

function getMaterialNames(
    ctx: WorkerContext,
    args: GetMaterialNamesArgs,
): GetMaterialNamesResult {
    const styleMgr = ctx.styleMgr;
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (names: string[]) => {
        for (const n of names) {
            if (!seen.has(n)) {
                seen.add(n);
                out.push(n);
            }
        }
    };
    if (args.sceneId) add(parseNames(styleMgr.getMaterialNamesJSON(args.sceneId)));
    add(parseNames(styleMgr.getMaterialNamesJSON(0)));
    return { names: out };
}

export const services = { getMaterialNames };
