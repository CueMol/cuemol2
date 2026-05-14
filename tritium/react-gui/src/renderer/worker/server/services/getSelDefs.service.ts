// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns data needed to populate the MolSelList picker:
//   - scene:      scene-level named selection defs from StyleManager
//   - global:     global named selection defs from StyleManager
//   - currentSel: the target molecule's current `sel` string, when molId is set
//
// Mirrors the UXP molsellist behaviour (`molsellist.js`):
//   stylem.getStrDataDefsJSON("sel", scene_id)  // scene-level
//   stylem.getStrDataDefsJSON("sel", 0)         // global
//   obj.sel.toString()                          // current selection
import type { WorkerContext } from '../types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';

export interface GetSelDefsArgs {
    sceneId: number;
    molId?: number;
}

export interface GetSelDefsResult {
    scene: string[];
    global: string[];
    /** Present only when molId is set and the molecule has a non-empty selection. */
    currentSel?: string;
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

function readCurrentSel(ctx: WorkerContext, sceneId: number, molId: number): string | undefined {
    try {
        const scene = ctx.sceMgr.getScene(sceneId) as Scene | null;
        if (!scene) return undefined;
        const mol = scene.getObject(molId) as MolCoord | null;
        if (!mol) return undefined;
        const sel = mol.sel;
        if (!sel) return undefined;
        const str = sel.toString();
        return str.length > 0 ? str : undefined;
    } catch {
        return undefined;
    }
}

function getSelDefs(ctx: WorkerContext, args: GetSelDefsArgs): GetSelDefsResult {
    const styleMgr = ctx.styleMgr;
    const scene = parseDefs(styleMgr.getStrDataDefsJSON('sel', args.sceneId));
    const global = parseDefs(styleMgr.getStrDataDefsJSON('sel', 0));
    const result: GetSelDefsResult = { scene, global };
    if (typeof args.molId === 'number') {
        const currentSel = readCurrentSel(ctx, args.sceneId, args.molId);
        if (currentSel !== undefined) result.currentSel = currentSel;
    }
    return result;
}

export const services = { getSelDefs };
