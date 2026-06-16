/**
 * @file worker/server/services/sceneClipboard.service.ts
 * @description Internal scene clipboard for Copy / Paste of object,
 * renderer, style and camera nodes.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 * The clipboard is a worker-process-local module singleton: the worker is
 * single-threaded so every service shares this state, and there is no need
 * to thread it through WorkerContext. Copied XML is held as a C++ ByteArray
 * reference (not a JS string) since the clipboard never leaves the worker.
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';
import { safeRead } from './helpers/safeRead';

export type ClipboardKind = 'object' | 'renderer' | 'style' | 'camera';

interface ClipboardEntry {
    kind: ClipboardKind;
    xml: ByteArray;
    sourceName: string;
    sourceClassName: string;
    /**
     * Scope id used to look up an existing entry of the same kind at
     * paste time (currently only used by style paste to detect a
     * name collision under the destination scene).
     */
    sourceScopeId?: number;
}

let clipboard: ClipboardEntry | null = null;

/** Test helper: reset the singleton between cases. Not exported via the service map. */
export function _resetClipboardForTest(): void {
    clipboard = null;
}

export interface CopyNodeArgs {
    sceneId: number;
    nodeId: number;
    nodeType: 'object' | 'renderer' | 'rendGroup' | 'style' | 'camera';
    /**
     * Style scope id (0 for global, scene.uid for scene-local). Required
     * when `nodeType === 'style'`; the renderer reads it from the tree
     * node's `styleInfo.scopeId` and forwards it. Ignored for other types.
     */
    scopeId?: number;
    /**
     * Camera name. Required when `nodeType === 'camera'` because cameras
     * are keyed by name at the Scene API level (the tree-row id for
     * cameras is a synthesised negative integer with no C++ meaning).
     * Ignored for other types.
     */
    cameraName?: string;
}

export interface CopyNodeResult {
    ok: boolean;
    /** What kind landed in the clipboard (renderer for both renderer and rendGroup). */
    kind: ClipboardKind | null;
}

/**
 * Serialize a scene node to XML and place it on the clipboard.
 *
 * Resolves the target by `nodeType` (object / renderer / rendGroup /
 * style / camera); renderer and rendGroup both land as kind `'renderer'`.
 * Copying a global-scope (scopeId 0) style is rejected.
 */
function copyNode(ctx: WorkerContext, args: CopyNodeArgs): CopyNodeResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, kind: null };

    let target: LScrObject | null = null;
    let sourceName = '';
    let sourceClassName = '';
    let kind: ClipboardKind;
    let sourceScopeId: number | undefined;

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false, kind: null };
        target = obj as unknown as LScrObject;
        sourceName = safeRead(() => obj.name) ?? '';
        sourceClassName =
            safeRead(() => (obj as unknown as { className: string }).className) ?? '';
        kind = 'object';
    } else if (args.nodeType === 'camera') {
        if (!args.cameraName) return { ok: false, kind: null };
        const cam = (safeRead(() =>
            scene.getCameraRef(args.cameraName!),
        ) as unknown as LScrObject | null) ?? null;
        if (!cam) return { ok: false, kind: null };
        target = cam;
        sourceName = args.cameraName;
        sourceClassName = 'Camera';
        kind = 'camera';
    } else if (args.nodeType === 'style') {
        // UXP `onCopyStyle` rejects global (scope==0) styles before
        // toXML; the ctxmenu already disables Copy for those rows, but
        // we mirror the early-return here for defence in depth.
        if (args.scopeId === undefined || args.scopeId === 0) {
            return { ok: false, kind: null };
        }
        const styleMgr = ctx.svc.getService('StyleManager') as unknown as
            | { getStyleSet: (id: number) => LScrObject | null }
            | null;
        if (!styleMgr) return { ok: false, kind: null };
        const set = styleMgr.getStyleSet(args.nodeId);
        if (!set) return { ok: false, kind: null };
        target = set;
        sourceName = safeRead(() => (set as unknown as { name: string }).name) ?? '';
        sourceClassName = 'StyleSet';
        sourceScopeId = args.scopeId;
        kind = 'style';
    } else {
        // renderer or rendGroup
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!rend) return { ok: false, kind: null };
        target = rend as unknown as LScrObject;
        sourceName = safeRead(() => rend.name) ?? '';
        sourceClassName =
            safeRead(() => (rend as unknown as { type_name: string }).type_name) ?? '';
        kind = 'renderer';
    }

    const xml = ctx.strMgr.toXML(target);
    if (!xml) return { ok: false, kind: null };

    clipboard = { kind, xml, sourceName, sourceClassName, sourceScopeId };
    return { ok: true, kind };
}

export interface PasteNodeArgs {
    sceneId: number;
    /** When pasting a renderer onto an object row, the object's uid. */
    targetObjId?: number;
    /**
     * When pasting a renderer onto a rendgroup row, the group's uid. The
     * worker resolves the group's parent mol via `group.getClientObj()`
     * and sets `rend.group = group.name` so the new renderer appears
     * under the group. Mutually exclusive with `targetObjId`.
     */
    targetGroupId?: number;
}

export interface PasteNodeResult {
    ok: boolean;
    /** New uid of the pasted node, or null. */
    newId: number | null;
    /** Final name (after uniquification), or empty. */
    newName: string;
}

/**
 * Restore the clipboard entry into the destination scene.
 *
 * Branches by clipboard kind. The pasted node is uniquified against the
 * destination (objects / renderers / styles gain a `_<i>` suffix, cameras
 * a `copy<i>_` prefix). A renderer paste targets either an object row
 * (`targetObjId`) or a rendgroup row (`targetGroupId`). Wrapped in an undo
 * transaction.
 */
function pasteNode(ctx: WorkerContext, args: PasteNodeArgs): PasteNodeResult {
    const empty: PasteNodeResult = { ok: false, newId: null, newName: '' };
    const entry = clipboard;
    if (!entry) return empty;

    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;

    if (entry.kind === 'camera') {
        // Paste a Camera under the destination scene (UXP `onCameraPaste`).
        // Cameras are keyed by name -- uniquify via UXP's "copy<i>_<orig>"
        // pattern when the destination already has one with that name.
        let newName = '';
        let ok = false;
        withUndoTxn(scene, 'Paste camera', () => {
            const restored = ctx.strMgr.fromXML(entry.xml, args.sceneId) as
                | LScrObject
                | null;
            if (!restored) return;
            const camView = restored as unknown as {
                name: string;
                notifyLoaded?: (s: Scene) => void;
            };
            const wanted = camView.name || entry.sourceName || 'camera';
            const finalName = uniqueCameraNameViaScene(scene, wanted);
            try { (scene as unknown as {
                setCamera: (n: string, c: LScrObject) => void;
            }).setCamera(finalName, restored); } catch { return; }
            try { camView.notifyLoaded?.(scene); } catch { /* ignore */ }
            newName = finalName;
            ok = true;
        });
        if (!ok) return empty;
        return { ok: true, newId: null, newName };
    }

    if (entry.kind === 'style') {
        // Paste a StyleSet under the destination scene (UXP `onPasteStyle`).
        // The scope is always `sceneId`; the source `sourceScopeId` only
        // matters for the copy-side gate.
        const styleMgr = ctx.svc.getService('StyleManager') as unknown as
            | {
                  hasStyleSet: (name: string, scopeId: number) => number;
                  destroyStyleSet: (scopeId: number, styleSetId: number) => boolean;
                  registerStyleSet: (
                      set: LScrObject,
                      nbefore: number,
                      scopeId: number,
                  ) => boolean;
              }
            | null;
        if (!styleMgr) return empty;

        let newName = '';
        let newId: number = -1;
        let ok = false;
        withUndoTxn(scene, 'Paste style', () => {
            const restored = ctx.strMgr.fromXML(entry.xml, args.sceneId) as
                | LScrObject
                | null;
            if (!restored) return;
            const setView = restored as unknown as { name: string; uid?: number };
            const wanted = (entry.sourceName || setView.name) || 'style';
            // UXP prompts to replace on name conflict; we auto-rename to
            // a unique name to match the object/renderer paste pattern
            // and avoid an extra confirm round-trip.
            const finalName = uniqueStyleName(styleMgr, wanted, args.sceneId);
            try { setView.name = finalName; } catch { /* ignore */ }
            ok = styleMgr.registerStyleSet(restored, 0, args.sceneId);
            if (ok) {
                newName = finalName;
                newId = typeof setView.uid === 'number' ? setView.uid : -1;
            }
        });
        if (!ok) return empty;
        return { ok: true, newId, newName };
    }

    if (entry.kind === 'object') {
        let newId: number = -1;
        let newName = '';
        withUndoTxn(scene, 'Paste object', () => {
            const restored = ctx.strMgr.fromXML(entry.xml, args.sceneId) as
                | LScrObject
                | null;
            if (!restored) return;
            const obj = restored as unknown as CueMolObject;
            // Uniquify name against the destination scene.
            const wanted = entry.sourceName || 'obj';
            const finalName = uniqueObjectName(scene, wanted);
            try { obj.name = finalName; } catch { /* not all classes have writable name */ }
            newId = scene.addObject(obj as unknown as CueMolObject);
            newName = finalName;
        });
        if (newId < 0) return empty;
        return { ok: true, newId, newName };
    }

    // renderer paste -- resolve the destination mol + group label from
    // whichever target the caller supplied.
    let target: CueMolObject | null = null;
    let destGroupName = '';
    let txnLabel = 'Paste renderer';
    if (args.targetGroupId !== undefined) {
        const group = scene.getRenderer(args.targetGroupId) as Renderer | null;
        if (!group) return empty;
        target = safeRead(() => group.getClientObj() as CueMolObject | null) ?? null;
        if (!target) return empty;
        destGroupName = safeRead(() => group.name) ?? '';
        txnLabel = 'Paste renderer into group';
    } else if (args.targetObjId !== undefined) {
        target = scene.getObject(args.targetObjId) as CueMolObject | null;
        if (!target) return empty;
    } else {
        return empty;
    }

    let newName = '';
    let newId: number = -1;
    withUndoTxn(scene, txnLabel, () => {
        const restored = ctx.strMgr.fromXML(entry.xml, args.sceneId) as
            | LScrObject
            | null;
        if (!restored) return;
        const rend = restored as unknown as Renderer;
        const wanted = entry.sourceName || 'rend';
        const finalName = uniqueRendererName(target!, wanted);
        try { rend.name = finalName; } catch { /* ignore */ }
        // Set the group string before attaching so the parent mol places
        // the new renderer under the right branch. For object paste
        // destGroupName is "" -- explicit clear matches UXP pasteRendImpl.
        try { rend.group = destGroupName; } catch { /* ignore */ }
        target!.attachRenderer(rend);
        newName = finalName;
        newId = safeRead(() => (rend as unknown as { uid: number }).uid) ?? -1;
    });
    if (newName === '') return empty;
    return { ok: true, newId, newName };
}

export interface GetClipboardKindArgs {
    /** Empty payload; ServiceMap requires an args shape. */
    _?: never;
}

export interface GetClipboardKindResult {
    kind: ClipboardKind | null;
    /** Source label for UI hint, e.g. "Paste 'mol1'". */
    sourceName: string;
}

/** Report the current clipboard kind and source label (for UI hints). */
function getClipboardKind(
    _ctx: WorkerContext,
    _args: GetClipboardKindArgs,
): GetClipboardKindResult {
    if (!clipboard) return { kind: null, sourceName: '' };
    return { kind: clipboard.kind, sourceName: clipboard.sourceName };
}

// --- helpers ---


/** Return `prefix`, or `prefix_<i>` if the scene already has that object. */
function uniqueObjectName(scene: Scene, prefix: string): string {
    if (!scene.getObjectByName(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}_${i}`;
        if (!scene.getObjectByName(candidate)) return candidate;
    }
    return `${prefix}_${Date.now()}`;
}

/** Return `prefix`, or `prefix_<i>` if the object already has that renderer. */
function uniqueRendererName(obj: CueMolObject, prefix: string): string {
    const tryFn = (n: string): unknown =>
        (obj as unknown as { getRendererByName: (s: string) => unknown }).getRendererByName(n);
    if (!tryFn(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}_${i}`;
        if (!tryFn(candidate)) return candidate;
    }
    return `${prefix}_${Date.now()}`;
}

/** Return `base`, or `copy<i>_<base>` if the scene already has that camera. */
function uniqueCameraNameViaScene(scene: Scene, base: string): string {
    if (!scene.hasCamera(base)) return base;
    for (let i = 1; i < 10000; i++) {
        const candidate = `copy${i}_${base}`;
        if (!scene.hasCamera(candidate)) return candidate;
    }
    return `${base}_${Date.now()}`;
}

/** Return `prefix`, or `prefix_<i>` if the scope already has that style set. */
function uniqueStyleName(
    mgr: { hasStyleSet: (name: string, scopeId: number) => number },
    prefix: string,
    scopeId: number,
): string {
    if (mgr.hasStyleSet(prefix, scopeId) === 0) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}_${i}`;
        if (mgr.hasStyleSet(candidate, scopeId) === 0) return candidate;
    }
    return `${prefix}_${Date.now()}`;
}

export const services = {
    copyNode,
    pasteNode,
    getClipboardKind,
};
