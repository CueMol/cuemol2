// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase: panel.workspace.ctxmenu.object -- Save As.
//
// Mirrors UXP `Qm2Main.onSaveAsObj` (`fileopen.js`). Three worker services:
//   - `getObjectSaveInfo`: enumerates compatible writers for the object,
//     returns filters + a sensible default file name (UXP uses
//     `copy_of_<leafName>` when the object has a `src` path, else
//     `<obj.name>`). The renderer side then shows a native save dialog
//     via `DIALOG_OBJECT_SAVE` and forwards the resolved path back here.
//   - `saveObjectToFile`: runs the
//     `createHandler` -> `setPath` -> `convToLink=true` -> `attach` ->
//     `write` -> `detach` dance UXP performs after the dialog.
//   - `listSavableObjects`: scene objects that have at least one compatible
//     writer, for the File-menu object picker (UXP `onFileSaveAs` applies the
//     same filter to its prompt list).

import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';
import type { WorkerContext } from '../types/WorkerContext';
import { parseSceneTreeJSON } from '../../shared/sceneTreeTypes';
import { getSceneOrNull } from './helpers/sceneResolver';
import { safeRead } from './helpers/safeRead';

// --- helpers ---

interface InfoEntry {
    name: string;
    descr: string;
    fext: string;
    category: number;
}

/**
 * Parse a stream-manager `fext` string ("*.pdb;*.ent" or "*.xyz") into a
 * list of bare extensions (`["pdb", "ent"]`). Matches the same split
 * used by `getOpenFilters`.
 */
function parseFext(fext: string): string[] {
    return fext
        .split(';')
        .map((e) => e.trim().replace(/^\*\./, ''))
        .filter((e) => e !== '' && e !== '*');
}


/**
 * Extract the basename portion of a path. Handles both POSIX and Windows
 * separators. UXP relies on `nsILocalFile.leafName`; we keep this in pure
 * JS so the worker doesn't pull in Node's `path` module.
 */
function basenameOf(p: string): string {
    if (!p) return '';
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(idx + 1) : p;
}

function dirnameOf(p: string): string {
    if (!p) return '';
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(0, idx) : '';
}

/**
 * Append a line to the CueMol message log (UXP `cuemol.putLogMsg`).
 * Guarded: a missing / failing MsgLog service must never fail an operation
 * that has already completed.
 */
function writeMsgLog(ctx: WorkerContext, message: string): void {
    try {
        const msgLog = ctx.svc.getService('MsgLog') as MsgLog | null;
        if (!msgLog) return;
        msgLog.writeln(message);
    } catch {
        /* logging must not fail the caller */
    }
}

/**
 * Compatible object-writer names for `objId`, as reported by the C++
 * StreamManager. Returns an empty list when the object has no writer (or the
 * lookup throws), which is how UXP `onFileSaveAs` decides an object is not
 * savable.
 */
function compatibleWriterNames(ctx: WorkerContext, objId: number): string[] {
    try {
        const csv = ctx.strMgr.findCompatibleWriterNamesForObj(objId);
        return csv.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    } catch {
        return [];
    }
}

// --- getObjectSaveInfo ---

export interface GetObjectSaveInfoArgs {
    sceneId: number;
    objId: number;
    /**
     * Writer to move to the head of `filters` (the last-used writer restored
     * from `UiState.saveWriterName`). Ignored when the object has no such
     * writer. UXP instead preselects `nsIFilePicker.filterIndex`; Electron has
     * no equivalent, so reordering is what makes the native dialog default to
     * this writer.
     */
    preferredWriter?: string;
}

/** One save-dialog filter row. Mirrors `ElectronFileFilter` shape. */
export interface SaveWriterFilter {
    /** Writer name (used as the `writerName` argument to `saveObjectToFile`). */
    name: string;
    /** Description shown in the native picker filter list. */
    description: string;
    /** Bare extensions (no leading `*.`). */
    extensions: string[];
}

export interface GetObjectSaveInfoResult {
    ok: boolean;
    /** Compatible writers in priority order. Empty when the object has none. */
    filters: SaveWriterFilter[];
    /** Default file name with extension. Empty when no filters apply. */
    defaultFileName: string;
    /** Default directory (absolute path) -- empty when the object has no `src`. */
    defaultDir: string;
}

function getObjectSaveInfo(
    ctx: WorkerContext,
    args: GetObjectSaveInfoArgs,
): GetObjectSaveInfoResult {
    const empty: GetObjectSaveInfoResult = {
        ok: false, filters: [], defaultFileName: '', defaultDir: '',
    };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return empty;

    const objName = safeRead(() => (obj as unknown as { name: string }).name) ?? '';
    const objSrc = safeRead(() => (obj as unknown as { src: string }).src) ?? '';

    // findCompatibleWriterNamesForObj returns a CSV string of writer names
    // matching the object's C++ class. UXP `Qm2Main.onSaveAsObj` builds
    // its filter list from the intersection of these with the full writer
    // catalogue via `getInfoJSON2`.
    const candidates = compatibleWriterNames(ctx, args.objId);
    if (candidates.length === 0) return empty;

    let info: InfoEntry[] = [];
    try {
        const json = ctx.strMgr.getInfoJSON2();
        info = JSON.parse(json) as InfoEntry[];
    } catch {
        return empty;
    }

    const filters: SaveWriterFilter[] = [];
    // Preserve the order of `candidates` (UXP's `makeFilter` iterates the
    // info list but our test expectation is "writer x picked first when
    // listed first in candidates", so we iterate candidates and look up).
    for (const name of candidates) {
        const entry = info.find(
            (e) => e.category === 1 && e.name === name,
        );
        if (!entry) continue;
        filters.push({
            name: entry.name,
            description: entry.descr,
            extensions: parseFext(entry.fext),
        });
    }
    if (filters.length === 0) return empty;

    // Restore the last-used writer by moving it to the head of the list. The
    // native dialog defaults to filters[0], so this both preselects the writer
    // and drives the default extension picked below.
    if (args.preferredWriter) {
        const pi = filters.findIndex((f) => f.name === args.preferredWriter);
        if (pi > 0) filters.unshift(filters.splice(pi, 1)[0]);
    }

    // Default file name + directory. UXP `onSaveAsObj`:
    //   - obj.src non-empty -> `copy_of_<leafName>` in the obj.src directory
    //   - obj.src empty -> `<obj.name>` (no directory, picker uses cwd)
    let defaultFileName: string;
    let defaultDir = '';
    if (objSrc) {
        defaultFileName = `copy_of_${basenameOf(objSrc)}`;
        defaultDir = dirnameOf(objSrc);
    } else {
        const ext0 = filters[0].extensions[0] ?? '';
        defaultFileName = ext0 ? `${objName}.${ext0}` : objName;
    }

    return { ok: true, filters, defaultFileName, defaultDir };
}

// --- saveObjectToFile ---

export interface SaveObjectToFileArgs {
    sceneId: number;
    objId: number;
    /** Absolute path resolved by the renderer-side native save dialog. */
    path: string;
    /** Writer name from `getObjectSaveInfo.filters[i].name`. */
    writerName: string;
}

export interface SaveObjectToFileResult {
    ok: boolean;
}

interface ObjWriterLike {
    setPath(path: string): void;
    convToLink: boolean;
    attach(obj: CueMolObject): void;
    write(): void;
    detach(): CueMolObject | null;
}

function saveObjectToFile(
    ctx: WorkerContext,
    args: SaveObjectToFileArgs,
): SaveObjectToFileResult {
    if (args.path.length === 0) return { ok: false };
    if (args.writerName.length === 0) return { ok: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false };

    let writer: ObjWriterLike | null;
    try {
        writer = ctx.strMgr.createHandler(args.writerName, 1) as unknown as ObjWriterLike;
    } catch {
        return { ok: false };
    }
    if (!writer) return { ok: false };

    let attached = false;
    try {
        writer.setPath(args.path);
        // UXP sets convToLink=true so the in-memory object is rewritten to
        // reference the new file as its `src`. Without it the obj remains
        // detached from the file.
        writer.convToLink = true;
        writer.attach(obj);
        attached = true;
        writer.write();
        // UXP `onSaveAsObj` reports the write in the message log pane.
        writeMsgLog(ctx, `File: [${args.path}] is saved.`);
        return { ok: true };
    } catch {
        return { ok: false };
    } finally {
        if (attached) {
            try { writer.detach(); } catch { /* ignore */ }
        }
    }
}

// --- listSavableObjects ---

export interface ListSavableObjectsArgs {
    sceneId: number;
}

export interface SavableObjectEntry {
    id: number;
    name: string;
    /** C++ class name of the object ("MolCoord", "DensityMap", ...). */
    className: string;
}

export interface ListSavableObjectsResult {
    ok: boolean;
    objects: SavableObjectEntry[];
}

/**
 * Scene objects that can actually be written to a file. UXP `onFileSaveAs`
 * filters its object prompt the same way -- objects whose
 * `findCompatibleWriterNamesForObj` is empty are not offered.
 */
function listSavableObjects(
    ctx: WorkerContext,
    args: ListSavableObjectsArgs,
): ListSavableObjectsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, objects: [] };
    const tree = parseSceneTreeJSON(scene.getSceneDataJSON());
    if (!tree) return { ok: false, objects: [] };

    const objects: SavableObjectEntry[] = [];
    for (const node of tree.children) {
        if (node.type !== 'object') continue;
        if (compatibleWriterNames(ctx, node.id).length === 0) continue;
        objects.push({ id: node.id, name: node.name, className: node.className });
    }
    return { ok: true, objects };
}

export const services = {
    getObjectSaveInfo,
    saveObjectToFile,
    listSavableObjects,
};
