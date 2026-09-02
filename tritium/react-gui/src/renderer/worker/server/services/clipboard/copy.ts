/**
 * @file worker/server/services/clipboard/copy.ts
 * @description Serializing scene nodes to bytes.
 *
 * One node or several: the multi-node form exists because the scene tree
 * allows a multi-selection, and a group selected together with its own
 * members must not put those members on the clipboard twice.
 */
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import { listGroupChildRenderers } from '@renderer/worker/server/services/helpers/groupChildren';
import type {
    ClipboardKind,
    CopyNodeArgs,
    CopyNodeResult,
    CopyNodesArgs,
    CopyNodesResult,
} from './types';
/** Copy the bytes of a serialized ByteArray out of the C++ heap. */
export function xmlToBytes(ctx: WorkerContext, xml: ByteArray): Uint8Array | null {
    const bytes = ctx.svc.copyToTypedArray(xml) as Uint8Array | null;
    return bytes && bytes.length > 0 ? bytes : null;
}

/**
 * Serialize a scene node to XML and return its bytes.
 *
 * Resolves the target by `nodeType` (object / renderer / rendGroup /
 * style / camera); renderer and rendGroup both come back as kind
 * `'renderer'`. Copying a global-scope (scopeId 0) style is rejected.
 */
export function copyNode(ctx: WorkerContext, args: CopyNodeArgs): CopyNodeResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, kind: null };

    let target: LScrObject | null = null;
    let kind: ClipboardKind;

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false, kind: null };
        target = obj as unknown as LScrObject;
        kind = 'object';
    } else if (args.nodeType === 'camera') {
        if (!args.cameraName) return { ok: false, kind: null };
        const cam = (safeRead(() =>
            scene.getCameraRef(args.cameraName!),
        ) as unknown as LScrObject | null) ?? null;
        if (!cam) return { ok: false, kind: null };
        target = cam;
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
        return { ok: true, kind: 'renderer', form: 'rendArray', bytes };
    } else {
        // single renderer
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!rend) return { ok: false, kind: null };
        target = rend as unknown as LScrObject;
        kind = 'renderer';
    }

    const xml = ctx.strMgr.toXML(target);
    if (!xml) return { ok: false, kind: null };
    const bytes = xmlToBytes(ctx, xml);
    if (!bytes) return { ok: false, kind: null };

    return { ok: true, kind, form: 'single', bytes };
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
export function copyNodes(ctx: WorkerContext, args: CopyNodesArgs): CopyNodesResult {
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
    //
    // De-duplicated by uid: selecting a group *and* one of its own children
    // reached the same renderer twice -- once through the group's membership
    // scan and once directly -- so arrayToXML serialized it twice and the paste
    // produced two copies. (Same shape as the group+child double-delete fixed
    // in resolveBulkItems.)
    const natives: unknown[] = [];
    const seen = new Set<number>();
    const pushRend = (rend: Renderer): void => {
        const uid = safeRead(() => rend.uid);
        if (typeof uid === 'number') {
            if (seen.has(uid)) return;
            seen.add(uid);
        }
        natives.push((rend as unknown as { wrapped: unknown }).wrapped);
    };
    // nodeTypes is read positionally; a short array would silently reclassify
    // the tail as plain renderers.
    if (args.nodeTypes.length !== args.nodeIds.length) {
        return { ok: false, kind: null, reason: 'nodeTypesMismatch' };
    }
    for (let i = 0; i < args.nodeIds.length; ++i) {
        const rend = scene.getRenderer(args.nodeIds[i]) as Renderer | null;
        if (!rend) continue;
        if (args.nodeTypes[i] === 'rendGroup') {
            for (const child of listGroupChildRenderers(scene, rend)) pushRend(child);
        } else {
            pushRend(rend);
        }
    }
    if (natives.length === 0) return { ok: false, kind: null };

    const xml = ctx.strMgr.arrayToXML(natives);
    if (!xml) return { ok: false, kind: null };
    const bytes = xmlToBytes(ctx, xml);
    if (!bytes) return { ok: false, kind: null };

    return { ok: true, kind: 'renderer', form: 'rendArray', bytes };
}
