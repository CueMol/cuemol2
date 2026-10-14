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
//
// A created set is named `style_N`, which is what UXP's `createStyle`
// proposes (`workspace_panel.js`). The name matters: `user` belongs to the
// global scope, where UXP's startup puts the user's own stylesheet
// (`cuemol2.js` loadStyleSetFromFile / createStyleSet("user", 0)), so
// creating a scene-scoped set by that name too left two unrelated sets
// called `user` side by side in the style list.
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { proposeUniqName } from '@renderer/worker/server/services/scene/proposeUniqName';
import { withUndoTxn } from '../withUndoTxn';
import { recordOp } from '@renderer/worker/server/actions/serviceOps';
import { isValidUid } from '@renderer/worker/shared/uid';

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

/**
 * The scene's own writable style set, made (as `style<n>`) when it has none.
 * Call inside an undo txn: making one is an edit.
 *
 * @returns its uid, or null when none could be made.
 */
export function ensureWritableSceneSet(ctx: WorkerContext, sceneId: number): number | null {
    const found = findWritableSceneSet(ctx.styleMgr, sceneId);
    if (found !== null) return found;
    const { name } = proposeUniqName(ctx, { kind: 'styleSet', prefix: 'style', sceneId });
    const setId = ctx.styleMgr.createStyleSet(name, sceneId);
    // C++ returns qlib::invalid_uid (0) on failure, never a negative
    // number -- the old `< 0` guard never fired and named selections
    // were written into style-set id 0.
    return isValidUid(setId) ? setId : null;
}

export function saveSelDef(ctx: WorkerContext, args: SaveSelDefArgs): SaveSelDefResult {
    const name = args.name.trim();
    const expr = args.expr.trim();
    if (name === '' || expr === '') return { ok: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const styleMgr = ctx.styleMgr;

    let ok = false;
    withUndoTxn(scene, 'Define named selection', () => {
        const setId = ensureWritableSceneSet(ctx, args.sceneId);
        if (setId === null) return;
        ok = styleMgr.setStrData('sel', name, expr, args.sceneId, setId);
        if (ok) recordOp(ctx, scene.uid, 'define_selection', { name, selection: expr, styleSet: null });
    });
    return { ok };
}
