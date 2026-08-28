// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Save a named selection (the builder's "Save as...") into the scene's
// StyleManager string-data store, category "sel". Scene-scoped: it persists
// with the scene file and surfaces in getSelDefs' `scene` list. Defining a
// named selection mutates the scene, so this IS wrapped in withUndoTxn.
//
// StyleMgr.setStrData requires a valid existing style-set UID within the
// scope; we pick the first writable scene-scoped set, creating one when none
// exists (mirrors UXP style_editor.js nScopeID/nStyleSetID usage).
import type { WorkerContext } from '../types/WorkerContext';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';
import { getSceneOrNull } from './helpers/sceneResolver';
import { withUndoTxn } from './withUndoTxn';
import { isValidUid } from '../../shared/uid';

export interface SaveSelDefArgs {
    sceneId: number;
    /** Name of the named selection. */
    name: string;
    /** Selection-string expression to store. */
    expr: string;
}

export interface SaveSelDefResult {
    ok: boolean;
}

interface StyleSetEntry {
    name: string;
    scene_id: number;
    uid: number;
    readonly: boolean;
}

/**
 * Find a writable style set in the given scene scope, returning its UID, or
 * null when the scope has no writable set.
 */
function findWritableSceneSet(styleMgr: StyleManager, sceneId: number): number | null {
    try {
        const parsed: unknown = JSON.parse(styleMgr.getStyleSetsJSON(sceneId));
        if (!Array.isArray(parsed)) return null;
        const entry = (parsed as StyleSetEntry[]).find(
            (s) => s.scene_id === sceneId && s.readonly === false,
        );
        return entry ? entry.uid : null;
    } catch {
        return null;
    }
}

function saveSelDef(ctx: WorkerContext, args: SaveSelDefArgs): SaveSelDefResult {
    const name = args.name.trim();
    const expr = args.expr.trim();
    if (name === '' || expr === '') return { ok: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const styleMgr = ctx.styleMgr;

    let ok = false;
    withUndoTxn(scene, 'Define named selection', () => {
        let setId = findWritableSceneSet(styleMgr, args.sceneId);
        if (setId === null) {
            setId = styleMgr.createStyleSet('user', args.sceneId);
            // C++ returns qlib::invalid_uid (0) on failure, never a negative
            // number -- the old `< 0` guard never fired and named selections
            // were written into style-set id 0.
            if (!isValidUid(setId)) return;
        }
        ok = styleMgr.setStrData('sel', name, expr, args.sceneId, setId);
    });
    return { ok };
}

export const services = { saveSelDef };
