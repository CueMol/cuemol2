// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// The render settings a scene stores: Scene app data "render", a C++
// `RenderSettings` object (src/modules/rendering/RenderSettings.qif) whose
// own properties are the backend-independent settings and whose child
// objects `povray` / `umbreon` / `umbreon_npr` hold each backend's. Reads
// return every value as a flat map keyed `key` / `<block>.key`; writes are
// one undoable edit that touches only the keys that change, and hands a key
// back to its declared default (resetProp) instead of storing the default.
//
// The child objects are reached through the parent's `getProp(block)` and
// then written with plain property names. Dot-path names are never passed
// to C++: NestedPropHandler falls back to the root object silently when a
// path does not resolve (a typo would set an unknown property and fail
// quietly instead of loudly), which is not a contract to build on.
import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { RenderSettingsValues, SceneRenderSettingsReply } from '@shared/types/renderWindow';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { collectProps } from '@renderer/worker/server/services/props/read';
import { undoTxnResult } from '@renderer/worker/server/services/withUndoTxn';
import { fail, failFrom, ok, type Result } from '@renderer/worker/shared/result';
import { sameRenderValue } from '@renderer/worker/shared/renderSettingsValues';

/** Scene app-data id and class of the stored render settings. */
export const RENDER_APP_DATA_ID = 'render';
export const RENDER_APP_DATA_CLASS = 'RenderSettings';
/** Undo-stack label of a settings write. */
export const RENDER_SETTINGS_UNDO_LABEL = 'Change render settings';
/** The child objects of RenderSettings, one per backend (the property names). */
export const RENDER_SETTINGS_BLOCKS = ['povray', 'umbreon', 'umbreon_npr'] as const;

export interface GetSceneRenderSettingsArgs {
    sceneId: number;
}

/**
 * Same shape as the render-window relay reply: main forwards this result to
 * the Rendering window verbatim, so the two must not drift apart.
 */
export type GetSceneRenderSettingsResult = SceneRenderSettingsReply;

export interface SetSceneRenderSettingsArgs {
    sceneId: number;
    values: RenderSettingsValues;
}

export type SetSceneRenderSettingsResult = Result<{
    /** What the scene holds after the write. */
    values: RenderSettingsValues;
    /** The keys the write changed (empty when the scene already held the values). */
    changed: string[];
}>;

/**
 * The Scene app-data API, probed: the generated wrapper of an addon built
 * against an older libcuemol2 lacks these methods.
 */
interface AppDataScene {
    hasAppData?: (id: string) => boolean;
    getAppData?: (id: string) => BaseWrapper | null | undefined;
    getCreateAppData?: (id: string, className: string) => BaseWrapper | null | undefined;
}

function appDataApi(scene: Scene): AppDataScene | null {
    const s = scene as unknown as AppDataScene;
    if (
        typeof s.hasAppData !== 'function' ||
        typeof s.getAppData !== 'function' ||
        typeof s.getCreateAppData !== 'function'
    ) {
        return null;
    }
    return s;
}

type Value = string | number | boolean;

/** One object's scalar properties: current values and declared defaults. */
interface BlockValues {
    values: Record<string, Value>;
    defaults: Record<string, Value>;
}

function isValue(v: unknown): v is Value {
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * The scalar properties of one object. The key list and the defaults come
 * from the property dump; the values are read back one by one so reals
 * arrive as the doubles C++ holds, not the text the dump prints.
 */
function readBlock(obj: BaseWrapper): BlockValues {
    const values: Record<string, Value> = {};
    const defaults: Record<string, Value> = {};
    for (const e of collectProps(obj)) {
        if (e.isContainer || e.depth !== 0) continue;
        let v: unknown;
        try {
            v = obj.getProp(e.key);
        } catch {
            v = e.value;
        }
        values[e.key] = isValue(v) ? v : e.value;
        if (e.hasdefault && e.defaultValue !== undefined) defaults[e.key] = e.defaultValue;
    }
    return { values, defaults };
}

/** The child object of a block, or null when the class does not declare it. */
function childOf(parent: BaseWrapper, block: string): BaseWrapper | null {
    try {
        if (!parent.hasProp(block)) return null;
        const child = parent.getProp(block) as unknown;
        return child && typeof (child as BaseWrapper).getPropsJSON === 'function'
            ? (child as BaseWrapper)
            : null;
    } catch {
        return null;
    }
}

/** Every stored key of a RenderSettings: its own scalars plus each block's under `<block>.`. */
export function readRenderSettingsValues(parent: BaseWrapper): {
    values: RenderSettingsValues;
    defaults: RenderSettingsValues;
} {
    const values: RenderSettingsValues = {};
    const defaults: RenderSettingsValues = {};
    const merge = (prefix: string, b: BlockValues): void => {
        for (const [k, v] of Object.entries(b.values)) values[prefix + k] = v;
        for (const [k, v] of Object.entries(b.defaults)) defaults[prefix + k] = v;
    };
    merge('', readBlock(parent));
    for (const block of RENDER_SETTINGS_BLOCKS) {
        const child = childOf(parent, block);
        if (child) merge(`${block}.`, readBlock(child));
    }
    return { values, defaults };
}

/** The live app-data object of the scene, or null when the scene holds none. */
function existingRenderSettings(s: AppDataScene): BaseWrapper | null {
    if (!s.hasAppData!(RENDER_APP_DATA_ID)) return null;
    return s.getAppData!(RENDER_APP_DATA_ID) ?? null;
}

/**
 * The settings object a render of `scene` is configured from (the umbreon
 * exporter's applyRenderSettings): the settings the scene stores, or a fresh
 * RenderSettings at the class defaults -- what the Rendering window shows
 * for a scene without settings of its own, and so what its editor holds when
 * it had nothing to write before the render. Never creates the holder in the
 * scene: a render is not an edit.
 */
export function renderSettingsForRender(ctx: WorkerContext, scene: Scene): BaseWrapper {
    const s = appDataApi(scene);
    const existing = s ? existingRenderSettings(s) : null;
    if (existing) return existing;
    const fresh = ctx.svc.createObj(RENDER_APP_DATA_CLASS) as BaseWrapper | null;
    if (!fresh) throw new Error(`cannot create ${RENDER_APP_DATA_CLASS}`);
    return fresh;
}

// A fresh RenderSettings, read once: what a scene without settings of its
// own shows, so the editor always starts from the C++ defaults.
let freshCache: { values: RenderSettingsValues; defaults: RenderSettingsValues } | null = null;

function freshRenderSettings(ctx: WorkerContext): {
    values: RenderSettingsValues;
    defaults: RenderSettingsValues;
} {
    if (!freshCache) {
        const obj = ctx.svc.createObj(RENDER_APP_DATA_CLASS) as BaseWrapper;
        freshCache = readRenderSettingsValues(obj);
    }
    return { values: { ...freshCache.values }, defaults: { ...freshCache.defaults } };
}

export function getSceneRenderSettings(
    ctx: WorkerContext,
    args: GetSceneRenderSettingsArgs,
): GetSceneRenderSettingsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: `scene ${args.sceneId} not found` };
    const s = appDataApi(scene);
    if (!s) return { ok: false, error: 'this build has no scene app data API' };
    try {
        const obj = existingRenderSettings(s);
        if (!obj) return { ok: true, exists: false, ...freshRenderSettings(ctx) };
        return { ok: true, exists: true, ...readRenderSettingsValues(obj) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/** Split a stored key into its block (or '' for the parent) and property name. */
function splitKey(key: string): { block: string; prop: string } {
    const i = key.indexOf('.');
    return i < 0 ? { block: '', prop: key } : { block: key.slice(0, i), prop: key.slice(i + 1) };
}

/**
 * Store `values` on the scene as one undo transaction.
 *
 * The diff against what the scene holds is taken before the transaction
 * opens: a C++ property write records an undo entry even when the value does
 * not change, and committing an empty transaction would clear the redo stack
 * (see withUndoTxn.ts). A value equal to the key's declared default is
 * written as a reset, so the scene file does not carry it. Keys the C++
 * class does not declare are skipped with a warning; the scene file's
 * schema is the class, not the caller.
 */
export function setSceneRenderSettings(
    ctx: WorkerContext,
    args: SetSceneRenderSettingsArgs,
): SetSceneRenderSettingsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found');
    const s = appDataApi(scene);
    if (!s) return fail('this build has no scene app data API', 'unsupported');

    let existing: BaseWrapper | null;
    try {
        existing = existingRenderSettings(s);
    } catch (e) {
        return failFrom(e);
    }
    // What the write is compared against: the scene's object, or the fresh
    // object a first write starts from.
    const current = existing ? readRenderSettingsValues(existing) : freshRenderSettings(ctx);

    const changed = Object.keys(args.values).filter((k) => {
        if (!(k in current.values)) {
            console.warn(`setSceneRenderSettings: unknown key "${k}" skipped`);
            return false;
        }
        return !sameRenderValue(current.values[k], args.values[k]);
    });
    if (changed.length === 0) return ok({ values: current.values, changed: [] });

    return undoTxnResult(scene, RENDER_SETTINGS_UNDO_LABEL, () => {
        const obj = existing ?? s.getCreateAppData!(RENDER_APP_DATA_ID, RENDER_APP_DATA_CLASS);
        if (!obj) return fail(`cannot create ${RENDER_APP_DATA_CLASS} app data`, 'unsupported');
        const targets = new Map<string, BaseWrapper | null>([['', obj]]);
        const targetOf = (block: string): BaseWrapper | null => {
            if (!targets.has(block)) targets.set(block, childOf(obj, block));
            return targets.get(block) ?? null;
        };
        const written: string[] = [];
        for (const k of changed) {
            const { block, prop } = splitKey(k);
            const target = targetOf(block);
            if (!target) {
                console.warn(`setSceneRenderSettings: no block "${block}" for "${k}"; skipped`);
                continue;
            }
            const def = current.defaults[k];
            if (def !== undefined && sameRenderValue(def, args.values[k])) target.resetProp(prop);
            else target.setProp(prop, args.values[k]);
            written.push(k);
        }
        return ok({ values: readRenderSettingsValues(obj).values, changed: written });
    });
}

export const services = { getSceneRenderSettings, setSceneRenderSettings };
