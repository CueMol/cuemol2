/**
 * @file renderer/worker/testing/fakes.ts
 * @description In-memory stand-ins for the C++ wrapper objects a worker
 * service touches (Scene / Object / Renderer / View / Camera).
 *
 * Test-only: production code must never import this directory (ESLint
 * forbids it). Each fake mirrors the *shape* the generated wrappers expose
 * (accessor properties, sync methods, the JSON documents `getSceneDataJSON`
 * and `getCameraInfoJSON` return) closely enough that a service runs
 * unmodified against it, while recording what the service did:
 *
 *   - every accessor write is spied (`fake.sets.name`, `fake.sets.sel`, ...)
 *     and the assigned value is readable back through the accessor;
 *   - mutating methods are `vi.fn`s, so a test can assert on them or
 *     override them (`mol.createRenderer.mockReturnValueOnce(null)`);
 *   - an optional shared `log` receives one entry per mutation, in order,
 *     for tests that pin call ordering ("name before applyStyles").
 *
 * Fakes are plain objects; cast at the service call site
 * (`scene as unknown as Scene`). Keep them structural -- add a member when a
 * service needs it rather than modelling the whole wrapper.
 */

import { vi, type Mock } from 'vitest';

/** Ordered mutation log shared by every fake created with the same array. */
export type CallLog = string[];

let nextUid = 1000;

/** Hand out a fresh uid; deterministic within a test (see resetFakeUids). */
export function allocUid(): number {
    return nextUid++;
}

/** Restart the uid counter (call from beforeEach when uids appear in assertions). */
export function resetFakeUids(): void {
    nextUid = 1000;
}

function fmt(v: unknown): string {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        } catch {
            return '[object]';
        }
    }
    return String(v);
}

/**
 * Install spied accessors on `target`: reading returns the stored value,
 * writing records the call in `sets[key]`, stores the value and appends
 * `<tag>.<key>=<value>` to the log.
 */
function spyProps(
    target: Record<string, unknown>,
    initial: Record<string, unknown>,
    sets: Record<string, Mock>,
    log: CallLog | undefined,
    tag: string,
): void {
    const values: Record<string, unknown> = { ...initial };
    for (const key of Object.keys(initial)) {
        const spy = vi.fn();
        sets[key] = spy;
        Object.defineProperty(target, key, {
            enumerable: true,
            configurable: true,
            get: () => values[key],
            set: (v: unknown) => {
                spy(v);
                values[key] = v;
                log?.push(`${tag}.${key}=${fmt(v)}`);
            },
        });
    }
}

interface FakeBaseOptions {
    uid?: number;
    name?: string;
    /** Shared ordered mutation log. */
    log?: CallLog;
    /** Prefix used in log entries (defaults to the fake kind). */
    tag?: string;
    /** Extra members merged onto the fake (duck-typed subclass methods). */
    extra?: Record<string, unknown>;
}

// --- Renderer ---

export interface FakeRendererOptions extends FakeBaseOptions {
    /** `type_name` (e.g. 'simple', 'cartoon', '*group'). Default 'simple'. */
    type?: string;
    /** `getClassName()`; default 'Renderer' ('RendGroup' for '*group'). */
    className?: string;
    /** Initial generic-prop store read by getProp / written by setProp. */
    props?: Record<string, unknown>;
    group?: string;
    visible?: boolean;
    locked?: boolean;
    ui_order?: number;
    /** Whether `getCenter()` / `has_center` exist (some types lack a center). */
    hasCenter?: boolean;
}

export interface FakeRenderer {
    [key: string]: unknown;
    uid: number;
    type_name: string;
    name: string;
    group: string;
    visible: boolean;
    locked: boolean;
    ui_order: number;
    sel: unknown;
    coloring: unknown;
    material: unknown;
    alpha: number;
    /** Accessor-write spies keyed by property name. */
    sets: Record<string, Mock>;
    /** Live generic-prop store behind getProp / setProp. */
    props: Record<string, unknown>;
    getUID: () => number;
    getClassName: () => string;
    getProp: Mock<(key: string) => unknown>;
    setProp: Mock<(key: string, value: unknown) => void>;
    hasProp: (key: string) => boolean;
    resetProp: Mock<(key: string) => void>;
    isPropDefault: (key: string) => boolean;
    applyStyles: Mock<(styles: string) => void>;
    reapplyStyle: Mock<() => void>;
    getClientObj: () => FakeObject | null;
    getClientObjID: () => number;
    getScene: () => FakeScene | null;
    /** Parent object; set by fakeObject when the renderer is attached. */
    owner: FakeObject | null;
}

/** Create a fake renderer. Attach it to an object via fakeObject({ renderers }) or mol.attachRenderer. */
export function fakeRenderer(opts: FakeRendererOptions = {}): FakeRenderer {
    const type = opts.type ?? 'simple';
    const tag = opts.tag ?? 'rend';
    const log = opts.log;
    const sets: Record<string, Mock> = {};
    const props: Record<string, unknown> = { ...(opts.props ?? {}) };
    const rend: Record<string, unknown> = {
        uid: opts.uid ?? allocUid(),
        type_name: type,
        sets,
        props,
        owner: null,
        getUID: () => rend.uid as number,
        getClassName: () => opts.className ?? (type === '*group' ? 'RendGroup' : 'Renderer'),
        getProp: vi.fn((key: string) => props[key]),
        setProp: vi.fn((key: string, value: unknown) => {
            props[key] = value;
            log?.push(`${tag}.setProp(${key},${fmt(value)})`);
        }),
        hasProp: (key: string) => key in props,
        resetProp: vi.fn((key: string) => {
            delete props[key];
            log?.push(`${tag}.resetProp(${key})`);
        }),
        isPropDefault: (key: string) => !(key in props),
        applyStyles: vi.fn((styles: string) => {
            log?.push(`${tag}.applyStyles(${styles})`);
        }),
        reapplyStyle: vi.fn(),
        getClientObj: () => rend.owner as FakeObject | null,
        getClientObjID: () => (rend.owner as FakeObject | null)?.uid ?? 0,
        getScene: () => (rend.owner as FakeObject | null)?.getScene() ?? null,
    };
    if (opts.hasCenter !== false) {
        rend.has_center = true;
        rend.getCenter = vi.fn(() => ({ __pos: true }));
    }
    spyProps(rend, {
        name: opts.name ?? type,
        group: opts.group ?? '',
        visible: opts.visible ?? true,
        locked: opts.locked ?? false,
        ui_order: opts.ui_order ?? 0,
        sel: undefined,
        coloring: undefined,
        material: '',
        alpha: 1,
    }, sets, log, tag);
    Object.assign(rend, opts.extra ?? {});
    return rend as unknown as FakeRenderer;
}

// --- Object (MolCoord, DensityMap, ...) ---

export interface FakeObjectOptions extends FakeBaseOptions {
    /** `getClassName()`; default 'MolCoord'. */
    className?: string;
    renderers?: FakeRenderer[];
    scene?: FakeScene | null;
    visible?: boolean;
    locked?: boolean;
    ui_collapsed?: boolean;
    ui_order?: number;
    /** Defaults applied to renderers created through createRenderer / createPresetRenderer. */
    rendererDefaults?: Omit<FakeRendererOptions, 'type' | 'name'>;
}

export interface FakeObject {
    [key: string]: unknown;
    uid: number;
    name: string;
    visible: boolean;
    locked: boolean;
    ui_collapsed: boolean;
    ui_order: number;
    sel: unknown;
    coloring: unknown;
    sets: Record<string, Mock>;
    /** Live renderer list in attach order (= `rend_uids` order). */
    renderers: FakeRenderer[];
    /** Owning scene; set by fakeScene({ objects }) / scene.addObject. */
    scene: FakeScene | null;
    readonly rend_uids: string;
    getUID: () => number;
    getClassName: () => string;
    getScene: () => FakeScene | null;
    getRendCount: () => number;
    getRenderer: (uid: number) => FakeRenderer | null;
    getRendererByType: (type: string) => FakeRenderer | null;
    getRendererByName: (name: string) => FakeRenderer | null;
    getRendererByNameType: (name: string, type: string) => FakeRenderer | null;
    attachRenderer: (rend: FakeRenderer) => void;
    createRenderer: Mock<(type: string) => FakeRenderer | null>;
    createPresetRenderer: Mock<(preset: string, grpName: string, prefix: string) => FakeRenderer | null>;
    destroyRenderer: Mock<(uid: number) => boolean>;
}

/** Create a fake object (molecule, map, ...). Mol-like classes also get `fitView`. */
export function fakeObject(opts: FakeObjectOptions = {}): FakeObject {
    const className = opts.className ?? 'MolCoord';
    const tag = opts.tag ?? 'mol';
    const log = opts.log;
    const sets: Record<string, Mock> = {};
    const renderers: FakeRenderer[] = [];
    const obj: Record<string, unknown> = {
        uid: opts.uid ?? allocUid(),
        sets,
        renderers,
        scene: opts.scene ?? null,
        getUID: () => obj.uid as number,
        getClassName: () => className,
        getScene: () => obj.scene as FakeScene | null,
        getRendCount: () => renderers.length,
        getRenderer: (uid: number) => renderers.find((r) => r.uid === uid) ?? null,
        getRendererByType: (type: string) => renderers.find((r) => r.type_name === type) ?? null,
        getRendererByName: (name: string) => renderers.find((r) => r.name === name) ?? null,
        getRendererByNameType: (name: string, type: string) =>
            renderers.find((r) => r.name === name && r.type_name === type) ?? null,
        attachRenderer: (rend: FakeRenderer) => {
            rend.owner = obj as unknown as FakeObject;
            renderers.push(rend);
        },
        createRenderer: vi.fn((type: string) => {
            const rend = fakeRenderer({ ...(opts.rendererDefaults ?? {}), type, name: type, log });
            (obj.attachRenderer as (r: FakeRenderer) => void)(rend);
            log?.push(`${tag}.createRenderer(${type})`);
            return rend;
        }),
        createPresetRenderer: vi.fn((preset: string, grpName: string, prefix: string) => {
            const grp = fakeRenderer({ ...(opts.rendererDefaults ?? {}), type: '*group', name: grpName, log });
            (obj.attachRenderer as (r: FakeRenderer) => void)(grp);
            log?.push(`${tag}.createPresetRenderer(${preset},${grpName},${prefix})`);
            return grp;
        }),
        destroyRenderer: vi.fn((uid: number) => {
            const i = renderers.findIndex((r) => r.uid === uid);
            if (i < 0) return false;
            renderers.splice(i, 1);
            log?.push(`${tag}.destroyRenderer(${uid})`);
            return true;
        }),
    };
    Object.defineProperty(obj, 'rend_uids', {
        enumerable: true,
        get: () => renderers.map((r) => r.uid).join(','),
    });
    if (className === 'MolCoord' || className.endsWith('Mol')) {
        obj.fitView = vi.fn();
    }
    spyProps(obj, {
        name: opts.name ?? className.toLowerCase(),
        visible: opts.visible ?? true,
        locked: opts.locked ?? false,
        ui_collapsed: opts.ui_collapsed ?? false,
        ui_order: opts.ui_order ?? 0,
        sel: undefined,
        coloring: undefined,
    }, sets, log, tag);
    Object.assign(obj, opts.extra ?? {});
    for (const r of opts.renderers ?? []) (obj.attachRenderer as (r: FakeRenderer) => void)(r);
    return obj as unknown as FakeObject;
}

// --- View ---

export interface FakeViewOptions extends FakeBaseOptions {
    scene?: FakeScene | null;
    /** Value returned by getViewCenter(). */
    center?: unknown;
    perspective?: boolean;
    centerMark?: string;
}

export interface FakeView {
    [key: string]: unknown;
    uid: number;
    name: string;
    perspective: boolean;
    centerMark: string;
    sets: Record<string, Mock>;
    scene: FakeScene | null;
    getUID: () => number;
    getScene: () => FakeScene | null;
    getViewCenter: Mock<() => unknown>;
    setViewCenter: Mock<(pos: unknown) => void>;
}

/** Create a fake view. Attach it to a scene via fakeScene({ views }). */
export function fakeView(opts: FakeViewOptions = {}): FakeView {
    const tag = opts.tag ?? 'view';
    const sets: Record<string, Mock> = {};
    let center: unknown = opts.center ?? { __center: true };
    const view: Record<string, unknown> = {
        uid: opts.uid ?? allocUid(),
        sets,
        scene: opts.scene ?? null,
        getUID: () => view.uid as number,
        getScene: () => view.scene as FakeScene | null,
        getViewCenter: vi.fn(() => center),
        setViewCenter: vi.fn((pos: unknown) => {
            center = pos;
            opts.log?.push(`${tag}.setViewCenter(${fmt(pos)})`);
        }),
    };
    spyProps(view, {
        name: opts.name ?? 'view',
        perspective: opts.perspective ?? true,
        centerMark: opts.centerMark ?? 'none',
    }, sets, opts.log, tag);
    Object.assign(view, opts.extra ?? {});
    return view as unknown as FakeView;
}

// --- Camera ---

export interface FakeCameraOptions {
    name: string;
    /** Source file path; '' for a camera saved from a live view. */
    src?: string;
    /** Number of saved vis-flag entries (`vis_size`). */
    visSize?: number;
    extra?: Record<string, unknown>;
}

export interface FakeCamera {
    [key: string]: unknown;
    name: string;
    src: string;
    vis_size: number;
}

/** Create a fake camera; it appears in the owning scene's getCameraInfoJSON(). */
export function fakeCamera(opts: FakeCameraOptions): FakeCamera {
    return { name: opts.name, src: opts.src ?? '', vis_size: opts.visSize ?? 0, ...(opts.extra ?? {}) };
}

// --- Scene ---

export interface FakeSceneOptions extends FakeBaseOptions {
    objects?: FakeObject[];
    views?: FakeView[];
    cameras?: FakeCamera[];
    bgcolor?: unknown;
    use_colproof?: boolean;
    icc_filename?: string;
}

/** Undo-transaction record kept by a fake scene. */
export interface FakeUndoLog {
    /** Labels passed to startUndoTxn, in order. */
    started: string[];
    /** Labels of transactions that reached commitUndoTxn. */
    committed: string[];
    /** Labels of transactions that were rolled back. */
    rolledBack: string[];
    /** Label of the transaction currently open, or null. */
    open: string | null;
}

export interface FakeScene {
    [key: string]: unknown;
    uid: number;
    name: string;
    bgcolor: unknown;
    use_colproof: boolean;
    icc_filename: string;
    sets: Record<string, Mock>;
    objects: FakeObject[];
    views: FakeView[];
    cameras: FakeCamera[];
    undo: FakeUndoLog;
    readonly obj_uids: string;
    readonly view_uids: string;
    getUID: () => number;
    setName: Mock<(name: string) => void>;
    getObject: Mock<(uid: number) => FakeObject | null>;
    getObjectByName: (name: string) => FakeObject | null;
    getRenderer: Mock<(uid: number) => FakeRenderer | null>;
    getRendByName: (name: string) => FakeRenderer | null;
    getView: Mock<(uid: number) => FakeView | null>;
    getViewCount: () => number;
    addObject: Mock<(obj: FakeObject) => void>;
    destroyObject: Mock<(uid: number) => boolean>;
    getSceneDataJSON: Mock<() => string>;
    getCameraInfoJSON: Mock<() => string>;
    hasCamera: (name: string) => boolean;
    getCamera: (name: string) => FakeCamera | null;
    setCamera: Mock<(name: string, cam: FakeCamera) => void>;
    destroyCamera: Mock<(name: string) => boolean>;
    saveViewToCam: Mock<(viewId: number, name: string) => boolean>;
    loadViewFromCam: Mock<(viewId: number, name: string) => boolean>;
    startUndoTxn: Mock<(label: string) => void>;
    commitUndoTxn: Mock<() => void>;
    rollbackUndoTxn: Mock<() => void>;
    isUndoable: () => boolean;
    isRedoable: () => boolean;
    getUndoSize: () => number;
}

/**
 * Renderer entry of the getSceneDataJSON document, in the C++ shape: a
 * group carries `childNodes` (its members, which are excluded from the top
 * level); a plain renderer omits the field.
 */
function rendNode(r: FakeRenderer, all: FakeRenderer[]): Record<string, unknown> {
    const node: Record<string, unknown> = {
        ID: r.uid, name: r.name, type: r.type_name,
        visible: r.visible, locked: r.locked, ui_order: r.ui_order,
    };
    if (r.type_name === '*group') {
        node.childNodes = all.filter((c) => c !== r && c.group === r.name).map((c) => rendNode(c, all));
    }
    return node;
}

/**
 * Create a fake scene. `getSceneDataJSON()` / `getCameraInfoJSON()` are
 * synthesised live from `objects` / `cameras` in the documented C++ shapes
 * (`[sceneNode, ...objectNodes]`, groups via `childNodes`,
 * `[{ name, vis_size, src }]`), so a test never hand-writes those documents.
 */
export function fakeScene(opts: FakeSceneOptions = {}): FakeScene {
    const tag = opts.tag ?? 'scene';
    const log = opts.log;
    const sets: Record<string, Mock> = {};
    const objects: FakeObject[] = [];
    const views: FakeView[] = [];
    const cameras: FakeCamera[] = [...(opts.cameras ?? [])];
    const undo: FakeUndoLog = { started: [], committed: [], rolledBack: [], open: null };
    const allRenderers = (): FakeRenderer[] => objects.flatMap((o) => o.renderers);
    const scene: Record<string, unknown> = {
        uid: opts.uid ?? allocUid(),
        sets,
        objects,
        views,
        cameras,
        undo,
        getUID: () => scene.uid as number,
        setName: vi.fn((name: string) => {
            (scene as unknown as FakeScene).name = name;
        }),
        getObject: vi.fn((uid: number) => objects.find((o) => o.uid === uid) ?? null),
        getObjectByName: (name: string) => objects.find((o) => o.name === name) ?? null,
        getRenderer: vi.fn((uid: number) => allRenderers().find((r) => r.uid === uid) ?? null),
        getRendByName: (name: string) => allRenderers().find((r) => r.name === name) ?? null,
        getView: vi.fn((uid: number) => views.find((v) => v.uid === uid) ?? null),
        getViewCount: () => views.length,
        addObject: vi.fn((obj: FakeObject) => {
            obj.scene = scene as unknown as FakeScene;
            objects.push(obj);
            log?.push(`${tag}.addObject(${obj.name})`);
        }),
        destroyObject: vi.fn((uid: number) => {
            const i = objects.findIndex((o) => o.uid === uid);
            if (i < 0) return false;
            objects.splice(i, 1);
            log?.push(`${tag}.destroyObject(${uid})`);
            return true;
        }),
        getSceneDataJSON: vi.fn(() => {
            const all = allRenderers();
            return JSON.stringify([
                { ID: scene.uid, name: (scene as unknown as FakeScene).name, type: '' },
                ...objects.map((o) => ({
                    ID: o.uid, name: o.name, type: o.getClassName(),
                    visible: o.visible, locked: o.locked,
                    ui_collapsed: o.ui_collapsed, ui_order: o.ui_order,
                    rends: o.renderers.filter((r) => r.group === '').map((r) => rendNode(r, all)),
                })),
            ]);
        }),
        getCameraInfoJSON: vi.fn(() =>
            JSON.stringify(cameras.map((c) => ({ name: c.name, vis_size: c.vis_size, src: c.src }))),
        ),
        hasCamera: (name: string) => cameras.some((c) => c.name === name),
        getCamera: (name: string) => cameras.find((c) => c.name === name) ?? null,
        setCamera: vi.fn((name: string, cam: FakeCamera) => {
            const i = cameras.findIndex((c) => c.name === name);
            if (i >= 0) cameras[i] = cam;
            else cameras.push(cam);
            log?.push(`${tag}.setCamera(${name})`);
        }),
        destroyCamera: vi.fn((name: string) => {
            const i = cameras.findIndex((c) => c.name === name);
            if (i < 0) return false;
            cameras.splice(i, 1);
            log?.push(`${tag}.destroyCamera(${name})`);
            return true;
        }),
        saveViewToCam: vi.fn(() => true),
        loadViewFromCam: vi.fn(() => true),
        startUndoTxn: vi.fn((label: string) => {
            undo.started.push(label);
            undo.open = label;
            log?.push(`${tag}.startUndoTxn(${label})`);
        }),
        commitUndoTxn: vi.fn(() => {
            if (undo.open !== null) undo.committed.push(undo.open);
            undo.open = null;
            log?.push(`${tag}.commitUndoTxn`);
        }),
        rollbackUndoTxn: vi.fn(() => {
            if (undo.open !== null) undo.rolledBack.push(undo.open);
            undo.open = null;
            log?.push(`${tag}.rollbackUndoTxn`);
        }),
        isUndoable: () => undo.committed.length > 0,
        isRedoable: () => false,
        getUndoSize: () => undo.committed.length,
    };
    Object.defineProperty(scene, 'obj_uids', {
        enumerable: true,
        get: () => objects.map((o) => o.uid).join(','),
    });
    Object.defineProperty(scene, 'view_uids', {
        enumerable: true,
        get: () => views.map((v) => v.uid).join(','),
    });
    spyProps(scene, {
        name: opts.name ?? 'scene',
        bgcolor: opts.bgcolor ?? null,
        use_colproof: opts.use_colproof ?? false,
        icc_filename: opts.icc_filename ?? '',
    }, sets, log, tag);
    Object.assign(scene, opts.extra ?? {});
    for (const o of opts.objects ?? []) {
        o.scene = scene as unknown as FakeScene;
        objects.push(o);
    }
    for (const v of opts.views ?? []) {
        v.scene = scene as unknown as FakeScene;
        views.push(v);
    }
    return scene as unknown as FakeScene;
}
