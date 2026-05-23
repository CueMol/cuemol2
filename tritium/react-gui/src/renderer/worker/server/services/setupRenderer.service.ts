// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Why this no longer goes through `NewRendererCommand`:
//
// The auto-generated wrapper setter `cmd.target_object = mol` ends up
// calling `setPropHelper` in `LWrapper.hpp`, which unconditionally calls
// `pthat->setupParentData("target_object")` on the command. That
// overwrites the molecule's `m_thisname` to `"target_object"` and its
// `m_rootuid` to the command's uid. From that point on, every subsequent
// child property assignment on the mol (e.g. `mol.coloring = paint` from
// `molPostProc`, or `rend.coloring = paint` after materialization)
// computes the child's `m_thisname` as `"target_object" + "coloring"` =
// `"target_objectcoloring"` -- a path NestedPropHandler cannot navigate
// because LScrObjBase::setupParentData concatenates without a dot. The
// undo records stored under that broken path then silently fail
// (PaintColUndo -> getProp "target_objectcoloring" not found), so
// nothing reverts on Cmd+Z.
//
// UXP code never uses the command property-setter pattern; it calls
// `mol.createRenderer(type)` directly. This service mirrors that
// approach so the molecule's parent linkage stays at its scene-graph
// default and the undo path through coloring/paint sub-objects works.
import type { WorkerContext } from '../types/WorkerContext';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { View } from '@cuemol/core/src/wrappers/View';
import type { RendererOptions } from '../../../components/fopen-opt-dlgs/types';
import { getDefaultStyleName } from './helpers/getDefaultStyleName';
import { makeSel } from './helpers/makeSel';
import { molPostProc } from './helpers/molPostProc';

const log = console;

const NON_MOL_CLASSES = ['ElePotMap', 'MolSurfObj', 'DensityMap'];

/**
 * Recenter every view in `scene` on `pos`. Mirrors the `if (m_bRecenView)`
 * block in `NewRendererCommand::run()` (uses scene.view_uids since the
 * C++ `getViewTable()` accessor is not wrapped to TS).
 */
function recenterAllViews(scene: Scene, pos: unknown): void {
    const uidStr = scene.view_uids;
    if (!uidStr) return;
    for (const tok of uidStr.split(',')) {
        const uid = Number(tok.trim());
        if (!Number.isFinite(uid)) continue;
        try {
            const view = scene.getView(uid) as View | null;
            if (view) view.setViewCenter(pos as never);
        } catch (e) {
            log.warn(`setViewCenter failed for view ${uid}:`, e);
        }
    }
}

export function setupRenderer(
    ctx: WorkerContext,
    mol: any,
    rendOpts: RendererOptions,
): Renderer | null {
    // Direct method call -- avoids the `cmd.target_object = mol` setter
    // that would corrupt mol.m_thisname (see file header).
    const rend = mol.createRenderer(rendOpts.rendererType) as Renderer | null;
    if (!rend) {
        log.warn(`Failed to create renderer of type '${rendOpts.rendererType}'`);
        return null;
    }

    if (rendOpts.rendererName) {
        // Setting the name through the typed wrapper still goes through
        // setPropHelper -> setupParentData("name"), but "name" returns a
        // string (not an object), so the early-return in setupParentData
        // (`if (!newval.isObject()) return;`) means no parent-linkage
        // mutation happens. Safe.
        (rend as unknown as { name: string }).name = rendOpts.rendererName;
    }

    const styleName = getDefaultStyleName(rendOpts.rendererType);
    if (styleName) {
        rend.applyStyles(styleName);
    }

    if (rendOpts.centerView) {
        try {
            const scene = mol.getScene() as Scene | null;
            if (scene && typeof (rend as unknown as { getCenter?: () => unknown }).getCenter === 'function') {
                const pos = (rend as unknown as { getCenter: () => unknown }).getCenter();
                recenterAllViews(scene, pos);
            }
        } catch (e) {
            log.warn('recenter view failed:', e);
        }
    }

    log.info('renderer created: rend=', rend);

    const className = mol.getClassName();
    if (!NON_MOL_CLASSES.includes(className)) {
        molPostProc(ctx, mol, true);

        if (rendOpts.selectionEnabled && rendOpts.selection && rendOpts.selection !== '*') {
            const sel = makeSel(ctx, rendOpts.selection);
            if (sel) {
                (rend as unknown as MolRenderer).sel = sel;
            } else {
                log.warn(`selection compile failed: ${rendOpts.selection}`);
            }
        }
    }
    return rend;
}
