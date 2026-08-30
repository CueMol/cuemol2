// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { makeTabLabel } from '@renderer/worker/shared/tabLabel';

export interface GetViewTabLabelArgs {
    viewId: number;
}

export interface GetViewTabLabelResult {
    ok: boolean;
    /** `<scene name>:<view name>` (UXP makeTabLabel); empty when not found. */
    title: string;
    /** Owning scene uid, or -1 when the view is gone. */
    sceneId: number;
}

/**
 * Resolve the current tab label for a molview, used to refresh the tab strip
 * after the owning scene (or the view) is renamed by any UI. Mirrors UXP
 * `TabMolView.makeTabLabel(scID, vwID)`.
 */
function getViewTabLabel(ctx: WorkerContext, args: GetViewTabLabelArgs): GetViewTabLabelResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!view) return { ok: false, title: '', sceneId: -1 };
    const scene = view.getScene() as Scene;
    if (!scene) return { ok: false, title: '', sceneId: -1 };
    return {
        ok: true,
        title: makeTabLabel(scene.name ?? '', view.name ?? ''),
        sceneId: scene.uid,
    };
}

export const services = { getViewTabLabel };
