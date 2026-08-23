/**
 * @file worker/server/services/sceneClipboard.service.ts
 * @description Serialize / restore scene nodes (object, renderer, style,
 * camera) for Copy / Paste.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 *
 * These services are **stateless**: copy returns the serialized bytes and
 * paste takes them back as an argument. The clipboard itself is the OS
 * clipboard, owned by the main process (`main/cuemolClipboard.ts`), so that
 * a payload can be exchanged with the UXP CueMol2 app and -- once the
 * single-instance lock is lifted -- between two CueMol3 instances. A worker
 * cache in front of it would go stale the moment another process copied,
 * which is exactly the case it would exist to serve.
 *
 * XML crosses the boundary as raw bytes (`copyToTypedArray`) because a
 * C++ ByteArray reference is meaningless outside this thread.
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
import { listGroupChildRenderers } from './helpers/groupChildren';

export type ClipboardKind = 'object' | 'renderer' | 'style' | 'camera';

/**
 * XML payload shape for kind 'renderer'. 'single' is one renderer
 * serialized with toXML; 'rendArray' is a renderer array serialized with
 * rendGrpToXML / arrayToXML (UXP clipboard type "qscrendary" -- element 0
 * of the restored array is the source group name). The clipboard kind
 * stays 'renderer' for both so ctxmenu Paste gating matches UXP
 * (qscrend | qscrendary enable the same item).
 */
export type ClipboardForm = 'single' | 'rendArray';

/** Copy the bytes of a serialized ByteArray out of the C++ heap. */
function xmlToBytes(ctx: WorkerContext, xml: ByteArray): Uint8Array | null {
    const bytes = ctx.svc.copyToTypedArray(xml) as Uint8Array | null;
    return bytes && bytes.length > 0 ? bytes : null;
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
    /** What was serialized (renderer for both renderer and rendGroup). */
    kind: ClipboardKind | null;
    /** Payload shape; 'single' for everything but a group copy. */
    form?: ClipboardForm;
    /** Source node name, carried as a display hint only. */
    name?: string;
    /** Serialized XML bytes, for the caller to put on the clipboard. */
    bytes?: Uint8Array;
}

/**
 * Serialize a scene node to XML and return its bytes.
 *
 * Resolves the target by `nodeType` (object / renderer / rendGroup /
 * style / camera); renderer and rendGroup both come back as kind
 * `'renderer'`. Copying a global-scope (scopeId 0) style is rejected.
 */
function copyNode(ctx: WorkerContext, args: CopyNodeArgs): CopyNodeResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, kind: null };

    let target: LScrObject | null = null;
    let sourceName = '';
    let kind: ClipboardKind;

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false, kind: null };
        target = obj as unknown as LScrObject;
        sourceName = safeRead(() => obj.name) ?? '';
        kind = 'object';
    } else if (args.nodeType === 'camera') {
        if (!args.cameraName) return { ok: false, kind: null };
        const cam = (safeRead(() =>
            scene.getCameraRef(args.cameraName!),
        ) as unknown as LScrObject | null) ?? null;
        if (!cam) return { ok: false, kind: null };
        target = cam;
        sourceName = args.cameraName;
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
        kind = 'style';
    } else if (args.nodeType === 'rendGroup') {
        // Deep-copy the group: serialize its member renderers (not the
        // empty group shell) together with the group name -- UXP
        // `multiRendCopyImpl` / clipboard type "qscrendary". Members are
        // enumerated live by group-name match; rendGrpToXML takes native
        // addon objects, so unwrap each TS wrapper via `.wrapped`.
        const grp = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!grp) return { ok: false, kind: null };
        const grpName = safeRead(() => grp.name) ?? '';
        const children = listGroupChildRenderers(scene, grp);
        const natives = children.map(
            (r) => (r as unknown as { wrapped: unknown }).wrapped,
        );
        const xml = ctx.strMgr.rendGrpToXML(natives, grpName);
        if (!xml) return { ok: false, kind: null };
        const bytes = xmlToBytes(ctx, xml);
        if (!bytes) return { ok: false, kind: null };
        return {
            ok: true,
            kind: 'renderer',
            form: 'rendArray',
            name: grpName,
            bytes,
        };
    } else {
        // single renderer
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!rend) return { ok: false, kind: null };
        target = rend as unknown as LScrObject;
        sourceName = safeRead(() => rend.name) ?? '';
        kind = 'renderer';
    }

    const xml = ctx.strMgr.toXML(target);
    if (!xml) return { ok: false, kind: null };
    const bytes = xmlToBytes(ctx, xml);
    if (!bytes) return { ok: false, kind: null };

    return { ok: true, kind, form: 'single', name: sourceName, bytes };
}

export interface PasteNodeArgs {
    sceneId: number;
    /** What the payload holds, from the clipboard read. */
    kind: ClipboardKind;
    /** Serialized XML bytes to restore. */
    bytes: Uint8Array;
    /** Payload shape; defaults to 'single'. */
    form?: ClipboardForm;
    /**
     * Source node name, used only as the fallback when the restored XML
     * carries no usable name. A payload copied in another app supplies no
     * name, which is why every branch prefers the restored object's own.
     */
    name?: string;
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
 * Restore a serialized payload into the destination scene.
 *
 * Branches by kind. The pasted node is uniquified against the destination
 * (objects / renderers / styles gain a `_<i>` suffix, cameras a `copy<i>_`
 * prefix). A renderer paste targets either an object row (`targetObjId`)
 * or a rendgroup row (`targetGroupId`). Wrapped in an undo transaction.
 */
function pasteNode(ctx: WorkerContext, args: PasteNodeArgs): PasteNodeResult {
    const empty: PasteNodeResult = { ok: false, newId: null, newName: '' };
    if (!args.bytes || args.bytes.length === 0) return empty;

    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;

    // Rebuild the C++ ByteArray the XML readers expect. Everything below
    // then runs exactly as it did when the payload came from a worker-local
    // clipboard, which is why an externally-produced payload needs no
    // special case.
    const xml = ctx.svc.copyFromTypedArray(args.bytes) as ByteArray | null;
    if (!xml) return empty;
    const entry = {
        kind: args.kind,
        xml,
        sourceName: args.name ?? '',
        form: args.form ?? 'single',
    };

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
        // The scope is always the destination `sceneId`; the source scope
        // only ever mattered for the copy-side gate.
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

    if (entry.form === 'rendArray') {
        // Renderer-array paste (deep group copy) -- UXP `onPasteRend`
        // "qscrendary" branch. Element 0 of the restored array is the
        // source group name; the rest are native renderer objects that
        // need `createWrapper` (UXP `convPolymObj`) before property access.
        let ok = false;
        let newName = '';
        let newId: number = -1;
        withUndoTxn(scene, 'Paste renderers', () => {
            const arr = ctx.strMgr.rendArrayFromXML(entry.xml, args.sceneId) as
                | unknown[]
                | null;
            if (!Array.isArray(arr) || arr.length === 0) return;
            const grpFromXml = typeof arr[0] === 'string' ? arr[0] : '';
            let destGrp = destGroupName;
            if (destGrp === '' && grpFromXml !== '') {
                // Pasting onto an object row with a group in the XML:
                // auto-create the group (UXP keeps the embedded name as-is;
                // we uniquify scene-wide because the group name is the
                // membership key -- matches createRendererGroup / rename).
                const finalGrp = uniqueGroupName(scene, grpFromXml);
                const grp = target!.createRenderer('*group') as unknown as
                    | Renderer
                    | null;
                if (!grp) return;
                try { grp.name = finalGrp; } catch { /* ignore */ }
                destGrp = finalGrp;
                newId = safeRead(() => (grp as unknown as { uid: number }).uid) ?? -1;
                newName = finalGrp;
                ok = true;
            }
            for (let i = 1; i < arr.length; i++) {
                const rend = ctx.strMgr.createWrapper(arr[i]) as Renderer | null;
                if (!rend) continue;
                // Incompatible renderer -> skip, keep pasting the rest
                // (UXP pasteRendImpl shows an alert per item; we warn).
                const compat = safeRead(() =>
                    (rend as unknown as {
                        isCompatibleObj: (o: CueMolObject) => boolean;
                    }).isCompatibleObj(target!));
                if (compat === false) {
                    console.warn('pasteNode: skipped incompatible renderer');
                    continue;
                }
                const wanted = (safeRead(() => rend.name) ?? '') || 'rend';
                const finalName = uniqueRendererName(target!, wanted);
                try { rend.name = finalName; } catch { /* ignore */ }
                try { rend.group = destGrp; } catch { /* ignore */ }
                target!.attachRenderer(rend);
                if (newName === '') newName = finalName;
                ok = true;
            }
            // Report the group as the pasted node when one was involved.
            if (destGrp !== '') newName = destGrp;
        });
        if (!ok) return empty;
        return { ok: true, newId: newId >= 0 ? newId : null, newName };
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

/**
 * Return `prefix`, or `prefix_<i>` if any renderer in the scene already
 * has that name. Group names are scene-wide unique because they are the
 * membership key (same gate as createRendererGroup / rendGroup rename).
 */
function uniqueGroupName(scene: Scene, prefix: string): string {
    const taken = (n: string): boolean =>
        !!safeRead(() => scene.getRendByName(n));
    if (!taken(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}_${i}`;
        if (!taken(candidate)) return candidate;
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


export interface CopyNodesArgs {
    sceneId: number;
    /** Tree-row ids of the selected nodes, in display order. */
    nodeIds: number[];
    /** Node type per id, positionally aligned with `nodeIds`. */
    nodeTypes: string[];
}

export interface CopyNodesResult {
    ok: boolean;
    kind: ClipboardKind | null;
    /** Always 'rendArray' when ok -- a multi copy is a renderer array. */
    form?: ClipboardForm;
    /** Empty: a multi copy has no single source name. */
    name?: string;
    /** Serialized XML bytes, for the caller to put on the clipboard. */
    bytes?: Uint8Array;
    /**
     * Why a copy was refused, so the caller can show UXP's alert text:
     * 'mixed' -- the selection spans more than one kind;
     * 'objectUnsupported' -- multiple objects, which UXP declines too.
     */
    reason?: 'mixed' | 'objectUnsupported';
}

/** UXP `convElemNodeTypes`: a group counts as a renderer for type checking. */
function normalizeNodeType(type: string): string {
    return type === 'rendGroup' ? 'renderer' : type;
}

/**
 * Copy a multi-selection to the clipboard (UXP `onMultiCopy`).
 *
 * UXP refuses two cases outright and this mirrors both: a selection of
 * mixed kinds, and multiple objects ("Multiple copy of object: not
 * supported"). What remains is a set of renderers -- possibly including
 * groups, which count as renderers for the type check -- serialized with
 * `arrayToXML` exactly as `multiRendCopyImpl` does when it has no group
 * name to embed.
 *
 * The entry lands as kind 'renderer' / form 'rendArray', the same shape a
 * single-group copy produces, so paste and the ctxmenu's Paste gating need
 * no new case (UXP likewise puts both under clipboard type "qscrendary").
 */
function copyNodes(ctx: WorkerContext, args: CopyNodesArgs): CopyNodesResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, kind: null };
    if (args.nodeIds.length === 0) return { ok: false, kind: null };

    const kinds = new Set(args.nodeTypes.map(normalizeNodeType));
    if (kinds.size !== 1) return { ok: false, kind: null, reason: 'mixed' };
    const [only] = [...kinds];
    if (only !== 'renderer') {
        // Objects are the only other multi-selectable kind; UXP declines
        // them explicitly, and styles / cameras never reach the multi menu.
        return { ok: false, kind: null, reason: 'objectUnsupported' };
    }

    // A selected group contributes its member renderers, matching what a
    // single-group copy serializes.
    const natives: unknown[] = [];
    for (let i = 0; i < args.nodeIds.length; ++i) {
        const rend = scene.getRenderer(args.nodeIds[i]) as Renderer | null;
        if (!rend) continue;
        if (args.nodeTypes[i] === 'rendGroup') {
            for (const child of listGroupChildRenderers(scene, rend)) {
                natives.push((child as unknown as { wrapped: unknown }).wrapped);
            }
        } else {
            natives.push((rend as unknown as { wrapped: unknown }).wrapped);
        }
    }
    if (natives.length === 0) return { ok: false, kind: null };

    const xml = ctx.strMgr.arrayToXML(natives);
    if (!xml) return { ok: false, kind: null };
    const bytes = xmlToBytes(ctx, xml);
    if (!bytes) return { ok: false, kind: null };

    return { ok: true, kind: 'renderer', form: 'rendArray', name: '', bytes };
}

export const services = {
    copyNode,
    copyNodes,
    pasteNode,
};
