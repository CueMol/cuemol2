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
import type { RendererOptions } from '../../shared/fileOpenTypes';
import { getDefaultStyleName } from './helpers/getDefaultStyleName';
import { makeSel } from './helpers/makeSel';
import { molPostProc } from './helpers/molPostProc';
import { safeRead } from './helpers/safeRead';

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

/**
 * Recenter the views on the new renderer when the dialog asked for it.
 * Works for both plain renderers and preset groups (RendGroup.getCenter
 * averages its members' centers).
 */
function recenterIfRequested(mol: any, rend: Renderer, rendOpts: RendererOptions): void {
    if (!rendOpts.centerView) return;
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

export function setupRenderer(
    ctx: WorkerContext,
    mol: any,
    rendOpts: RendererOptions,
): Renderer | null {
    if (rendOpts.presetName) {
        // Preset renderer group (UXP doSetupRend /RendPreset$/ branch):
        // C++ creates the *group renderer plus one child per <renderer>
        // node of the preset style; each child gets its sel / style from
        // the style definition and its name as name_prefix + type. Both
        // grp_name and name_prefix are the dialog's rendererName. The
        // caller's undo txn covers all N+1 registrations.
        let rend: Renderer | null = null;
        try {
            rend = mol.createPresetRenderer(
                rendOpts.presetName,
                rendOpts.rendererName,
                rendOpts.rendererName,
            ) as Renderer | null;
        } catch (e) {
            // C++ throws on an unknown style or a non-rendpreset type.
            log.warn(`createPresetRenderer('${rendOpts.presetName}') failed:`, e);
            return null;
        }
        if (!rend) return null;
        // No name assignment (C++ setName(grp_name) already did it) and no
        // applyStyles (children carry styles from the preset definition;
        // UXP's setDefaultStyles is a no-op on a *group). The dialog's
        // Selection is not applied either: RendGroup has no sel, and the
        // children's sel comes from the preset (the UI disables the
        // Selection field while a preset is picked).
        recenterIfRequested(mol, rend, rendOpts);
        if (!NON_MOL_CLASSES.includes(mol.getClassName())) {
            molPostProc(ctx, mol, true, safeRead(() => (mol.getScene() as Scene | null)?.uid) ?? 0);
        }
        return rend;
    }

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

    recenterIfRequested(mol, rend, rendOpts);

    log.info('renderer created: rend=', rend);

    const className = mol.getClassName();
    if (!NON_MOL_CLASSES.includes(className)) {
        // Named selections and colours are scoped to the scene's style set
        // (saveSelDef writes them there and getSelDefs offers them to the UI),
        // so compiling in the default global scope made a scene-local name
        // fail to resolve -- the renderer was then created with no selection at
        // all, showing every atom.
        const sceneUid = safeRead(() => (mol.getScene() as Scene | null)?.uid) ?? 0;
        molPostProc(ctx, mol, true, sceneUid);

        if (rendOpts.selectionEnabled && rendOpts.selection && rendOpts.selection !== '*') {
            const sel = makeSel(ctx, rendOpts.selection, sceneUid);
            if (sel) {
                (rend as unknown as MolRenderer).sel = sel;
            } else {
                log.warn(`selection compile failed: ${rendOpts.selection}`);
            }
        }
    }
    return rend;
}
