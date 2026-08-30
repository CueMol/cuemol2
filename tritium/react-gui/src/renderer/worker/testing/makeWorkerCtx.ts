/**
 * @file renderer/worker/testing/makeWorkerCtx.ts
 * @description Build a `WorkerContext` over fake managers for a worker
 * service test.
 *
 * Test-only (see fakes.ts). The managers resolve the fakes handed in
 * (`sceMgr.getScene(uid)` finds a scene in `scenes`, `strMgr.createHandler`
 * returns the reader registered under that name, ...) and are `vi.fn`s, so
 * a test can both assert on them and override a single call. Anything a
 * service needs beyond that is passed through `extra`.
 */

import { vi, type Mock } from 'vitest';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { FakeObject, FakeRenderer, FakeScene, FakeView } from './fakes';

/** One entry of `StreamManager.getInfoJSON2(category)`. */
export interface FakeReaderInfo {
    name: string;
    /** Space-separated glob list, e.g. '*.pdb *.ent'. */
    fext: string;
    /** StreamManager category (OBJECT_READER = 0, SCENE_READER = 2, ...). */
    category: number;
    /** Optional human-readable description. */
    descr?: string;
}

export interface WorkerCtxOptions {
    scenes?: FakeScene[];
    /** Views resolvable through sceMgr.getView; defaults to every scene's views. */
    views?: FakeView[];
    /** Backs `ctx.svc.createObj(className)`; throws when absent. */
    createObj?: (className: string) => unknown;
    /** Backs `ctx.svc.getService(name)`; null when absent. */
    getService?: (name: string) => unknown;
    /** Command objects returned by `cmdMgr.getCmd(name)`; unknown names throw. */
    cmds?: Record<string, unknown>;
    /** Handlers returned by `strMgr.createHandler(name, category)`; unknown names return null. */
    readers?: Record<string, unknown>;
    /** Entries served by `strMgr.getInfoJSON2()` (callers filter on `category`). */
    readerInfo?: FakeReaderInfo[];
    /** Style names served by `styleMgr.getStyleNamesJSON(sceneId)`, keyed by scene uid (0 = global). */
    styleNames?: Record<number, string[]>;
    /** Extra members merged onto each manager (duck-typed methods a service needs). */
    extra?: {
        svc?: Record<string, unknown>;
        sceMgr?: Record<string, unknown>;
        cmdMgr?: Record<string, unknown>;
        strMgr?: Record<string, unknown>;
        styleMgr?: Record<string, unknown>;
    };
}

export interface FakeSceneManager {
    [key: string]: unknown;
    getScene: Mock<(uid: number) => FakeScene | null>;
    getView: Mock<(uid: number) => FakeView | null>;
    getObject: Mock<(uid: number) => FakeObject | null>;
    getRenderer: Mock<(uid: number) => FakeRenderer | null>;
    readonly scene_uids: string;
    activeSceneID: number;
    createScene: Mock<() => FakeScene>;
    destroyScene: Mock<(uid: number) => boolean>;
    /** Live scene list (createScene appends here). */
    scenes: FakeScene[];
}

export interface FakeWorkerCtx {
    ctx: WorkerContext;
    sceMgr: FakeSceneManager;
    cmdMgr: { [key: string]: unknown; getCmd: Mock<(name: string) => unknown> };
    strMgr: {
        [key: string]: unknown;
        getInfoJSON2: Mock<() => string>;
        createHandler: Mock<(name: string, category: number) => unknown>;
    };
    styleMgr: {
        [key: string]: unknown;
        getStyleNamesJSON: Mock<(sceneId: number) => string>;
        hasStyleSet: Mock<(name: string, sceneId: number) => number>;
    };
    svc: {
        [key: string]: unknown;
        createObj: Mock<(className: string) => unknown>;
        getService: Mock<(name: string) => unknown>;
    };
}

/**
 * Create a `WorkerContext` backed by fakes.
 *
 * @param opts - Fakes and lookup tables the managers resolve against.
 * @returns The context plus each fake manager for assertions / overrides.
 */
export function makeWorkerCtx(opts: WorkerCtxOptions = {}): FakeWorkerCtx {
    const scenes: FakeScene[] = [...(opts.scenes ?? [])];
    const views = (): FakeView[] => opts.views ?? scenes.flatMap((s) => s.views);
    const allObjects = (): FakeObject[] => scenes.flatMap((s) => s.objects);

    const sceMgr: Record<string, unknown> = {
        scenes,
        activeSceneID: scenes[0]?.uid ?? 0,
        getScene: vi.fn((uid: number) => scenes.find((s) => s.uid === uid) ?? null),
        getView: vi.fn((uid: number) => views().find((v) => v.uid === uid) ?? null),
        getObject: vi.fn((uid: number) => allObjects().find((o) => o.uid === uid) ?? null),
        getRenderer: vi.fn((uid: number) =>
            allObjects().flatMap((o) => o.renderers).find((r) => r.uid === uid) ?? null),
        createScene: vi.fn(() => {
            throw new Error('makeWorkerCtx: pass extra.sceMgr.createScene to create scenes');
        }),
        destroyScene: vi.fn((uid: number) => {
            const i = scenes.findIndex((s) => s.uid === uid);
            if (i < 0) return false;
            scenes.splice(i, 1);
            return true;
        }),
        ...(opts.extra?.sceMgr ?? {}),
    };
    Object.defineProperty(sceMgr, 'scene_uids', {
        enumerable: true,
        get: () => scenes.map((s) => s.uid).join(','),
    });

    const cmds = opts.cmds ?? {};
    const cmdMgr = {
        getCmd: vi.fn((name: string) => {
            if (!(name in cmds)) throw new Error(`makeWorkerCtx: no fake command '${name}' (pass it via cmds)`);
            return cmds[name];
        }),
        ...(opts.extra?.cmdMgr ?? {}),
    };

    const readers = opts.readers ?? {};
    const readerInfo = opts.readerInfo ?? [];
    const strMgr = {
        getInfoJSON2: vi.fn(() => JSON.stringify(readerInfo)),
        createHandler: vi.fn((name: string) => readers[name] ?? null),
        searchReaderByContent: vi.fn(() => ''),
        ...(opts.extra?.strMgr ?? {}),
    };

    const styleNames = opts.styleNames ?? {};
    const styleMgr = {
        getStyleNamesJSON: vi.fn((sceneId: number) =>
            JSON.stringify((styleNames[sceneId] ?? []).map((name) => ({ name })))),
        hasStyleSet: vi.fn(() => 0),
        ...(opts.extra?.styleMgr ?? {}),
    };

    const svc = {
        createObj: vi.fn((className: string) => {
            if (!opts.createObj) throw new Error(`makeWorkerCtx: createObj('${className}') has no fake (pass createObj)`);
            return opts.createObj(className);
        }),
        getService: vi.fn((name: string) => opts.getService?.(name) ?? null),
        ...(opts.extra?.svc ?? {}),
    };

    const ctx = { svc, sceMgr, cmdMgr, strMgr, styleMgr } as unknown as WorkerContext;
    return {
        ctx,
        sceMgr: sceMgr as unknown as FakeSceneManager,
        cmdMgr: cmdMgr as FakeWorkerCtx['cmdMgr'],
        strMgr: strMgr as FakeWorkerCtx['strMgr'],
        styleMgr: styleMgr as FakeWorkerCtx['styleMgr'],
        svc: svc as FakeWorkerCtx['svc'],
    };
}
