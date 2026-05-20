// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 4d: pre-fetch for the NewRendererDialog. Resolves the target obj
// and reports its name, class, default renderer name suggestion, and the
// list of compatible renderer types. Mirrors the data the UXP
// `setupRendByObjID` flow stuffs into its `data[]` array before showing
// the dialog (`renderer.js`).

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';

const NON_MOL_CLASSES = new Set(['ElePotMap', 'MolSurfObj', 'DensityMap']);

export interface GetNewRendererOptionsArgs {
    sceneId: number;
    /** Source row uid (object / renderer / rendGroup). The worker resolves
     *  the target obj + inherited groupName from this. */
    sourceNodeId: number;
    sourceNodeType: 'object' | 'renderer' | 'rendGroup';
}

export interface GetNewRendererOptionsResult {
    ok: boolean;
    /** Uid of the resolved target object — the new renderer attaches here. */
    targetObjId: number;
    /** Group name to assign to the new renderer (empty when not in a group). */
    groupName: string;
    /** Selectable renderer types (filtered: no synthetic / atomintr / disorder). */
    rendererTypes: string[];
    /** Suggested initial renderer name (`${firstType}1` unique-scene-wide). */
    defaultName: string;
    /** Target object name (for the disabled dialog label). */
    objName: string;
    /** C++ class name (drives MolSelList visibility). */
    objClassName: string;
    /** True when the object supports MolCoord-style selection. */
    isMol: boolean;
}

const EMPTY: GetNewRendererOptionsResult = {
    ok: false,
    targetObjId: -1,
    groupName: '',
    rendererTypes: [],
    defaultName: '',
    objName: '',
    objClassName: '',
    isMol: false,
};

function resolveTarget(
    scene: Scene,
    args: GetNewRendererOptionsArgs,
): { obj: CueMolObject; groupName: string } | null {
    if (args.sourceNodeType === 'object') {
        const obj = scene.getObject(args.sourceNodeId) as CueMolObject | null;
        if (!obj) return null;
        return { obj, groupName: '' };
    }
    // renderer / rendGroup: parent obj via getClientObj.
    const rend = scene.getRenderer(args.sourceNodeId) as Renderer | null;
    if (!rend) return null;
    const obj = rend.getClientObj() as CueMolObject | null;
    if (!obj) return null;
    let groupName = '';
    if (args.sourceNodeType === 'rendGroup') {
        try { groupName = rend.name ?? ''; } catch { /* ignore */ }
    } else {
        // renderer row: inherit its current group (UXP onNewCmd renderer branch).
        try { groupName = rend.group ?? ''; } catch { /* ignore */ }
    }
    return { obj, groupName };
}

function getNewRendererOptions(
    ctx: WorkerContext,
    args: GetNewRendererOptionsArgs,
): GetNewRendererOptionsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return EMPTY;
    const resolved = resolveTarget(scene, args);
    if (!resolved) return EMPTY;
    const { obj, groupName } = resolved;

    let objName = '';
    try { objName = obj.name ?? ''; } catch { /* ignore */ }
    // Use the getClassName() METHOD, not a `className` property — the
    // worker-side C++ wrapper exposes the former (the latter reads back
    // undefined). This must match getCompatibleRendererNames.service so the
    // renderer-type history key is shared between the file-open and
    // add-renderer flows.
    let objClassName = '';
    try {
        objClassName =
            (obj as unknown as { getClassName?: () => string }).getClassName?.() ?? '';
    } catch { /* ignore */ }

    let listStr = '';
    try { listStr = obj.searchCompatibleRendererNames() ?? ''; }
    catch { /* ignore */ }

    const rendererTypes = listStr
        .split(',')
        .map((s) => s.trim())
        .filter((s) => {
            if (!s) return false;
            if (s.startsWith('*')) return false;
            if (s === 'atomintr' || s === 'disorder') return false;
            return true;
        });

    // Default name: `${firstType}1`, then `${firstType}2`, ... scene-wide.
    let defaultName = '';
    if (rendererTypes.length > 0) {
        const prefix = rendererTypes[0];
        for (let i = 1; i < 10000; i++) {
            const candidate = `${prefix}${i}`;
            if (!scene.getRendByName(candidate)) { defaultName = candidate; break; }
        }
        if (!defaultName) defaultName = `${prefix}${Date.now()}`;
    }

    let targetObjId = -1;
    try {
        targetObjId = (obj as unknown as { uid: number }).uid ?? -1;
    } catch { /* ignore */ }

    return {
        ok: true,
        targetObjId,
        groupName,
        rendererTypes,
        defaultName,
        objName,
        objClassName,
        isMol: !NON_MOL_CLASSES.has(objClassName),
    };
}

export const services = {
    getNewRendererOptions,
};
