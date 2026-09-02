/**
 * @file worker/server/services/clipboard/paste.ts
 * @description Restoring serialized nodes into a scene.
 *
 * The bytes may have come from another process -- the UXP CueMol2 app, or
 * another CueMol3 -- so nothing in them can be trusted to still exist here:
 * every name is made unique against the target scene (names.ts) and every
 * reference is resolved against it rather than followed.
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import type { PasteNodeArgs, PasteNodeResult } from './types';
import {
    uniqueCameraNameViaScene,
    uniqueGroupName,
    uniqueObjectName,
    uniqueRendererName,
    uniqueStyleName,
} from './names';
/**
 * Restore a serialized payload into the destination scene.
 *
 * Branches by kind. The pasted node is uniquified against the destination
 * (objects / renderers / styles gain a `_<i>` suffix, cameras a `copy<i>_`
 * prefix). A renderer paste targets either an object row (`targetObjId`)
 * or a rendgroup row (`targetGroupId`). Wrapped in an undo transaction.
 */
export function pasteNode(ctx: WorkerContext, args: PasteNodeArgs): PasteNodeResult {
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
            const wanted = camView.name || 'camera';
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
            const wanted = setView.name || 'style';
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
            // The restored XML carries the name; uniquify it against the scene.
            const wanted = (safeRead(() => obj.name) ?? '') || 'obj';
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
        // Same as the array path above and UXP pasteRendImpl: the restored
        // renderer's own name, uniquified against the destination object.
        const wanted = (safeRead(() => rend.name) ?? '') || 'rend';
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
