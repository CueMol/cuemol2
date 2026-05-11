// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Internal scene clipboard for Copy / Paste of object / renderer nodes.
// Lives as a worker-process-local module singleton because the worker is
// single-threaded — every service shares this module's state. No need to
// thread the slot through WorkerContext.
//
// Mirrors UXP `workspace_panel_copipe.js` `onCopyCmd` / `onPasteObj` /
// `onPasteRend`, but with the simplification that XML is held as a C++
// ByteArray reference rather than a JS string (no marshalling needed
// since clipboard never leaves the worker process).

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';

export type ClipboardKind = 'object' | 'renderer';

interface ClipboardEntry {
    kind: ClipboardKind;
    xml: ByteArray;
    sourceName: string;
    sourceClassName: string;
}

let clipboard: ClipboardEntry | null = null;

/** Test helper: reset the singleton between cases. Not exported via the service map. */
export function _resetClipboardForTest(): void {
    clipboard = null;
}

// ─── copyNode ─────────────────────────────────────────────────────────────

export interface CopyNodeArgs {
    sceneId: number;
    nodeId: number;
    nodeType: 'object' | 'renderer' | 'rendGroup';
}

export interface CopyNodeResult {
    ok: boolean;
    /** What kind landed in the clipboard (renderer for both renderer and rendGroup). */
    kind: ClipboardKind | null;
}

function copyNode(ctx: WorkerContext, args: CopyNodeArgs): CopyNodeResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false, kind: null };

    let target: LScrObject | null = null;
    let sourceName = '';
    let sourceClassName = '';
    let kind: ClipboardKind;

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false, kind: null };
        target = obj as unknown as LScrObject;
        sourceName = safeRead(() => obj.name) ?? '';
        sourceClassName =
            safeRead(() => (obj as unknown as { className: string }).className) ?? '';
        kind = 'object';
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

    clipboard = { kind, xml, sourceName, sourceClassName };
    return { ok: true, kind };
}

// ─── pasteNode ────────────────────────────────────────────────────────────

export interface PasteNodeArgs {
    sceneId: number;
    /** Required when pasting a renderer (target object to attach into). */
    targetObjId?: number;
}

export interface PasteNodeResult {
    ok: boolean;
    /** New uid of the pasted node, or null. */
    newId: number | null;
    /** Final name (after uniquification), or empty. */
    newName: string;
}

function pasteNode(ctx: WorkerContext, args: PasteNodeArgs): PasteNodeResult {
    const empty: PasteNodeResult = { ok: false, newId: null, newName: '' };
    const entry = clipboard;
    if (!entry) return empty;

    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return empty;

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

    // renderer paste
    if (args.targetObjId === undefined) return empty;
    const target = scene.getObject(args.targetObjId) as CueMolObject | null;
    if (!target) return empty;

    let newName = '';
    let newId: number = -1;
    withUndoTxn(scene, 'Paste renderer', () => {
        const restored = ctx.strMgr.fromXML(entry.xml, args.sceneId) as
            | LScrObject
            | null;
        if (!restored) return;
        const rend = restored as unknown as Renderer;
        const wanted = entry.sourceName || 'rend';
        const finalName = uniqueRendererName(target, wanted);
        try { rend.name = finalName; } catch { /* ignore */ }
        target.attachRenderer(rend);
        newName = finalName;
        newId = safeRead(() => (rend as unknown as { uid: number }).uid) ?? -1;
    });
    if (newName === '') return empty;
    return { ok: true, newId, newName };
}

// ─── getClipboardKind ─────────────────────────────────────────────────────

export interface GetClipboardKindArgs {
    /** Empty payload; ServiceMap requires an args shape. */
    _?: never;
}

export interface GetClipboardKindResult {
    kind: ClipboardKind | null;
    /** Source label for UI hint, e.g. "Paste 'mol1'". */
    sourceName: string;
}

function getClipboardKind(
    _ctx: WorkerContext,
    _args: GetClipboardKindArgs,
): GetClipboardKindResult {
    if (!clipboard) return { kind: null, sourceName: '' };
    return { kind: clipboard.kind, sourceName: clipboard.sourceName };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function safeRead<T>(read: () => T): T | undefined {
    try { return read(); } catch { return undefined; }
}

function uniqueObjectName(scene: Scene, prefix: string): string {
    if (!scene.getObjectByName(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}_${i}`;
        if (!scene.getObjectByName(candidate)) return candidate;
    }
    return `${prefix}_${Date.now()}`;
}

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

export const services = {
    copyNode,
    pasteNode,
    getClipboardKind,
};
