// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns named atom-selection definitions known to the StyleManager:
//   - scene-level: defined in the active scene
//   - global:      defined in user/global style sheets (sceneUid=0)
//
// Mirrors the UXP molsellist behaviour (`molsellist.js`):
//   stylem.getStrDataDefsJSON("sel", scene_id)  // scene-level
//   stylem.getStrDataDefsJSON("sel", 0)         // global
import type { WorkerContext } from '../types/WorkerContext';

export interface GetSelDefsArgs {
    sceneId: number;
}

export interface GetSelDefsResult {
    scene: string[];
    global: string[];
}

function parseDefs(json: string): string[] {
    try {
        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
        return [];
    }
}

function getSelDefs(ctx: WorkerContext, args: GetSelDefsArgs): GetSelDefsResult {
    const styleMgr = ctx.styleMgr;
    const scene = parseDefs(styleMgr.getStrDataDefsJSON('sel', args.sceneId));
    const global = parseDefs(styleMgr.getStrDataDefsJSON('sel', 0));
    return { scene, global };
}

export const services = { getSelDefs };
