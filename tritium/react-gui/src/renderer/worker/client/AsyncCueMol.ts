/**
 * @file renderer/worker/client/AsyncCueMol.ts
 * @description Renderer-thread facade over `WorkerTransport` + `ObjectFactory`
 * + `EventSlots`. Exposes one async method per worker entry point used by
 * the renderer.
 *
 * All public methods are `async` (each call is one IPC round-trip). To
 * avoid chained `await` overhead, prefer writing a worker service that
 * does the work in one round-trip rather than calling many methods here
 * in sequence.
 */
import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { SceneBgColor, ViewCenterMark } from '../../../shared/ipcTypes';
import type { FileOpenOptions } from '../../components/fopen-opt-dlgs/types';
import { ObjTuple } from '../shared/ObjTuple';
import { ObjProxy } from './ObjProxy';
import {
    WorkerTransport,
    type StreamProgressListener,
    type RenderProgressListener,
} from './WorkerTransport';
import { EventSlots } from './EventSlots';
import { ObjectFactory } from './ObjectFactory';
import * as lifecycleApi from './apis/lifecycleApi';
import * as viewApi from './apis/viewApi';
import * as inputApi from './apis/inputApi';
import * as fileApi from './apis/fileApi';
import * as editApi from './apis/editApi';
import * as sceneViewApi from './apis/sceneViewApi';
import type { ProposeUniqNameArgs, ProposeUniqNameResult } from '../server/services/proposeUniqName.service';
import type { GetCompatibleRendererNamesResult } from '../server/services/getCompatibleRendererNames.service';
import type { GetMtzColumnInfoResult } from '../server/services/getMtzColumnInfo.service';
import type { GetReaderDefaultOptionsResult } from '../server/services/getReaderDefaultOptions.service';
import type { CreateViewInSceneArgs, CreateViewInSceneResult } from '../server/services/createViewInScene.service';
import type { ProposeNewTabNamesArgs, ProposeNewTabNamesResult } from '../server/services/proposeNewTabNames.service';
import type { GetSceneCloseInfoResult } from '../server/services/getSceneCloseInfo.service';
import * as naviApi from './apis/naviApi';
import type {
    MethodArgs,
    MethodKey,
    MethodResult,
    RpcArgs,
    RpcKey,
    RpcResult,
    ServiceArgs,
    ServiceKey,
    ServiceResult,
} from '../shared/WorkerCalls';

const log = console;

/**
 * Renderer-thread facade. One instance per renderer process; constructed
 * via `createCueMol()` in `client/index.ts`.
 */
export class AsyncCueMol {
    private _transport: WorkerTransport;
    private _slots: EventSlots;
    private _factory: ObjectFactory;

    /** Construct the transport, slot table, and object factory. */
    constructor() {
        this._slots = new EventSlots();
        this._transport = new WorkerTransport({
            onEventNotify: (args) => this._slots.notify(...args),
        });
        this._factory = new ObjectFactory(this._transport, this);
    }

    // --- Transport facade (preserves test surface + ObjProxy contract) ---

    /** Whether the worker has been launched and not yet terminated. */
    isReady(): boolean { return this._transport.isReady(); }

    /** Whether at least one tracked call is currently in flight. */
    isBusy(): boolean { return this._transport.isBusy(); }

    /** Subscribe to busy-state edges. Returns an unsubscribe function. */
    subscribeBusy(cb: (busy: boolean) => void): () => void { return this._transport.subscribeBusy(cb); }

    /** Subscribe to `stream-progress` push messages. */
    subscribeStreamProgress(cb: StreamProgressListener): () => void {
        return this._transport.subscribeStreamProgress(cb);
    }

    /** Subscribe to `render-progress` push messages from `renderJob`. */
    subscribeRenderProgress(cb: RenderProgressListener): () => void {
        return this._transport.subscribeRenderProgress(cb);
    }

    /** Low-level raw worker call. Prefer the typed helpers below. */
    invokeWorker(method: string, ...args: any[]): Promise<any[]> {
        return this._transport.invokeWorker(method, ...args);
    }

    /**
     * Low-level raw worker call carrying a `Transferable`.
     *
     * @remarks Used only by `bindCanvas` to transfer the
     *   `OffscreenCanvas`; not tracked by the busy counter.
     */
    invokeWorkerWithTransfer(method: string, transfer: any, ...args: any[]): Promise<any[]> {
        return this._transport.invokeWorkerWithTransfer(method, transfer, ...args);
    }

    /** Call a worker service (`ServiceMap` entry). */
    invokeService<K extends ServiceKey>(name: K, args: ServiceArgs<K>): Promise<ServiceResult<K>> {
        return this._transport.invokeService(name, args);
    }

    /** Call a worker variadic method (`MethodMap` entry). */
    invokeMethodTyped<K extends MethodKey>(name: K, ...args: MethodArgs<K>): Promise<MethodResult<K>> {
        return this._transport.invokeMethod(name, ...args);
    }

    /** Call a worker RPC handler (`RpcMap` entry -- used by `ObjProxy`). */
    invokeRpc<K extends RpcKey>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
        return this._transport.invokeRpc(name, ...args);
    }

    /** Fire-and-forget `postMessage`. */
    postMessage(method: string, seq: number, args: any[], xfer: any = null): void {
        this._transport.postMessage(method, seq, args, xfer);
    }

    /** Allocate the next call sequence number. */
    getSeqNo(): number { return this._transport.getSeqNo(); }

    /** Register a one-shot reply handler keyed by `method.seqno`. */
    addListener(method: string, seqno: number, handler: any): void {
        this._transport.addListener(method, seqno, handler);
    }

    // --- Factory facade (preserves BaseWrapper._utils contract) ---

    /** Construct a `BaseWrapper` for an already-resolved `ObjProxy`. */
    createWrapperImpl(obj: ObjProxy): BaseWrapper { return this._factory.createWrapperImpl(obj); }

    /** Resolve a Promise of `ObjProxy` and wrap the result. */
    createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> { return this._factory.createWrapper(prom); }

    /** Return the `ObjTuple` underlying a proxy. */
    getWrapped(obj: ObjProxy): ObjTuple { return this._factory.getWrapped(obj); }

    /** Create a new C++ object of `className` on the worker side. */
    createObj(className: string): Promise<BaseWrapper | null> { return this._factory.createObj(className); }

    /** Look up a registered singleton service (`StyleManager`, ...). */
    getService(className: string): Promise<BaseWrapper | null> { return this._factory.getService(className); }

    /** Check whether `className` is registered with the C++ class registry. */
    hasClass(className: string): Promise<boolean | null> { return this._factory.hasClass(className); }

    /** Return a JSON document listing every class known to the registry. */
    getAllClassNamesJSON(): Promise<string | null> { return this._factory.getAllClassNamesJSON(); }

    // --- Event subscription ---

    /**
     * Register a worker-side event listener and remember the slot id.
     *
     * @param aCatStr - Category string (`'log'` for log events, `''` for
     *   source-uid match).
     * @param aSrcType - Source-type bitmask (OR-combine `SEM_*` constants).
     * @param aEvtType - Event-type filter (`SEM_ANY` for any).
     * @param aSrcID - Source uid scope (`scene.uid`, or `SEM_ANY` for
     *   global).
     * @param aObs - Observer: function `(args) => void` or object with
     *   `notify(args)`.
     * @returns The slot id; pass to {@link removeEventListener} for
     *   cleanup.
     * @remarks Forgetting cleanup leaks listeners across scene switches
     *   and causes ghost handlers to fire on stale state. See "CueMol
     *   event framework" in `tritium/CLAUDE.md`.
     */
    async addEventListener(
        aCatStr: string, aSrcType: number, aEvtType: number, aSrcID: number, aObs: any,
    ): Promise<number> {
        const [slot_id]: [number, any] = await this._transport.invokeWorker(
            'addEventListener', aCatStr, aSrcType, aEvtType, aSrcID,
        ) as [number, any];
        log.info("event listener registered: <" + aCatStr + ">, id=" + slot_id);
        this._slots.register(slot_id, aObs);
        return slot_id;
    }

    /**
     * Remove a previously-registered event listener.
     *
     * @param nID - Slot id returned by {@link addEventListener}.
     */
    async removeEventListener(nID: number): Promise<void> {
        await this._transport.invokeWorker('removeEventListener', nID);
        this._slots.unregister(nID);
        log.info("EventManager, unload slot: " + nID);
    }

    /**
     * Dispatch an `event-notify` payload received from the worker.
     *
     * @remarks Wired internally by the constructor; not normally called
     *   from outside.
     */
    eventNotify(
        slot: number, category: string, srcCat: number, evtType: number, srcUID: number, evtStr: string,
    ): any {
        return this._slots.notify(slot, category, srcCat, evtType, srcUID, evtStr);
    }

    // --- Lifecycle ---

    /** Boot the worker-side CueMol runtime by loading `sysconfig.xml`. */
    initCueMol(sysConfigPath?: string): Promise<void> { return lifecycleApi.initCueMol(this._transport, sysConfigPath); }

    /** Apply a user style sheet to the running scene manager. */
    loadUserStyle(userStylePath?: string): Promise<boolean> { return lifecycleApi.loadUserStyle(this._transport, userStylePath); }

    /** Switch the renderer's view-input style (mouse-button bindings). */
    setViewInputConfigStyle(styleName: string): Promise<boolean> { return lifecycleApi.setViewInputConfigStyle(this._transport, styleName); }

    /** Shut down the worker and terminate the underlying handle. */
    terminateWorker(): Promise<void> { return lifecycleApi.terminateWorker(this._transport); }

    /** Fetch app `{ version, build }` metadata from the worker. */
    getAppInfo(): Promise<{ version: string; build: string }> { return lifecycleApi.getAppInfo(this._transport); }

    // --- View lifecycle ---

    /**
     * Transfer canvas control to the worker and bind it to a view.
     *
     * @remarks One-shot per canvas element: `transferControlToOffscreen()`
     *   may be called only once. Use {@link addView} for additional view
     *   tabs on the already-bound canvas.
     */
    bindCanvas(canvas: any, view_id: number, dpr: number): Promise<any[]> { return viewApi.bindCanvas(this._transport, canvas, view_id, dpr); }

    /** Attach a new view to the already-bound OffscreenCanvas. */
    addView(view_id: number, dpr: number): Promise<boolean> { return viewApi.addView(this._transport, view_id, dpr); }

    /** Make `view_id` the currently rendered view. */
    activateView(view_id: number): Promise<void> { return viewApi.activateView(this._transport, view_id); }

    /** Stop the view loop and remove the view from `bound_views`. */
    removeView(view_id: number): Promise<void> { return viewApi.removeView(this._transport, view_id); }

    /** Notify the worker that a view's canvas was resized. */
    resized(view_id: number, w: number, h: number, dpr: number): void { viewApi.resized(this._transport, view_id, w, h, dpr); }

    // --- Input events (fire-and-forget) ---

    /** Forward a mouse event to the worker. */
    onMouseEvent(view_id: number, method: string, event: any): void { inputApi.onMouseEvent(this._transport, view_id, method, event); }

    /** Forward a wheel event to the worker. */
    onWheelEvent(view_id: number, event: any): void { inputApi.onWheelEvent(this._transport, view_id, event); }

    /** Forward a trackpad gesture to the worker. */
    onGestureEvent(view_id: number, axisID: number, delta: number, event?: any): void {
        inputApi.onGestureEvent(this._transport, view_id, axisID, delta, event);
    }

    // --- File operations ---

    /** Ask which renderer types are compatible with `filePath`. */
    getCompatibleRendererNames(filePath: string, readerName?: string, contentFirst = false): Promise<GetCompatibleRendererNamesResult> {
        return fileApi.getCompatibleRendererNames(this._transport, filePath, readerName, contentFirst);
    }

    /** Read MTZ column labels + resolution range for the file-open dialog. */
    getMtzColumnInfo(filePath: string): Promise<GetMtzColumnInfoResult> {
        return fileApi.getMtzColumnInfo(this._transport, filePath);
    }

    /** Read an ObjReader's option-property defaults (C++ source of truth). */
    getReaderDefaultOptions(nickname: string): Promise<GetReaderDefaultOptionsResult> {
        return fileApi.getReaderDefaultOptions(this._transport, nickname);
    }

    /** Fetch open-dialog filters for the given file-category id. */
    getOpenFilters(catId: number): Promise<ElectronFileFilter[]> { return fileApi.getOpenFilters(this._transport, catId); }

    /** Create a new scene + default view on the worker side. */
    createNewSceneAndView(dpr: number, name?: string, bindView?: boolean): Promise<{ scene_uid: number; view_uid: number; scene_name: string; view_name: string } | null> {
        return fileApi.createNewSceneAndView(this._transport, dpr, name, bindView);
    }

    /** Load a QSC scene file into an existing scene. */
    loadScene(filePath: string, scene_id: number): Promise<boolean> { return fileApi.loadScene(this._transport, filePath, scene_id); }

    /**
     * Load an object (PDB / map / mesh / ...) into a scene.
     *
     * `contentFirst` toggles the reader-selection strategy on the C++
     * side: when true (e.g. file dialog had only catch-all filters
     * selected), every reader is content-sniffed and the extension is
     * ignored; when false (a specific filter was selected), the
     * extension narrows the candidate set first and sniff disambiguates
     * only when multiple readers share the extension.
     */
    loadObject(filePath: string, scene_id: number, options: FileOpenOptions,
               contentFirst = false, maxSniffBytes?: number, readerName?: string): Promise<boolean> {
        return fileApi.loadObject(this._transport, filePath, scene_id, options,
                                  contentFirst, maxSniffBytes, readerName);
    }

    // --- Edit ---

    /** Undo the last transaction on a scene. */
    undo(scene_id: number, depth = 0): Promise<boolean> { return editApi.undo(this._transport, scene_id, depth); }

    /** Redo the most recently undone transaction. */
    redo(scene_id: number, depth = 0): Promise<boolean> { return editApi.redo(this._transport, scene_id, depth); }

    // --- Scene / View settings ---

    /** Read the projection mode (perspective vs orthographic) of a view. */
    getViewProjection(viewId: number): Promise<{ ok: boolean; perspective: boolean } | null> {
        return sceneViewApi.getViewProjection(this._transport, viewId);
    }

    /** Change the projection mode of a view. */
    setViewProjection(viewId: number, perspective: boolean): Promise<{ ok: boolean; perspective: boolean } | null> {
        return sceneViewApi.setViewProjection(this._transport, viewId, perspective);
    }

    /** Read the view-center mark display style. */
    getViewCenterMark(viewId: number): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
        return sceneViewApi.getViewCenterMark(this._transport, viewId);
    }

    /** Change the view-center mark display style. */
    setViewCenterMark(viewId: number, centerMark: ViewCenterMark): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
        return sceneViewApi.setViewCenterMark(this._transport, viewId, centerMark);
    }

    /** Read the background color of a scene. */
    getSceneBgColor(sceneId: number): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
        return sceneViewApi.getSceneBgColor(this._transport, sceneId);
    }

    /** Set the background color of a scene to a preset name. */
    setSceneBgColor(sceneId: number, colorName: 'white' | 'black'): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
        return sceneViewApi.setSceneBgColor(this._transport, sceneId, colorName);
    }

    /** Propose a unique name in a given namespace (scene / object / ...). */
    proposeUniqName(args: ProposeUniqNameArgs): Promise<ProposeUniqNameResult | null> {
        return sceneViewApi.proposeUniqName(this._transport, args);
    }

    /** Create an additional view inside an existing scene (multi-view). */
    createViewInScene(args: CreateViewInSceneArgs): Promise<CreateViewInSceneResult | null> {
        return sceneViewApi.createViewInScene(this._transport, args);
    }

    /** Compute default names for a new-tab dialog. */
    proposeNewTabNames(args: ProposeNewTabNamesArgs): Promise<ProposeNewTabNamesResult | null> {
        return sceneViewApi.proposeNewTabNames(this._transport, args);
    }

    /** Ask whether closing a view requires a save-changes prompt. */
    getSceneCloseInfo(viewId: number): Promise<GetSceneCloseInfoResult | null> {
        return sceneViewApi.getSceneCloseInfo(this._transport, { viewId });
    }

    // --- Navigation tools ---

    /** Hit-test the cursor at `(x, y)` in `viewId`. */
    naviHitTest(args: { viewId: number; x: number; y: number }): Promise<{ hit: boolean; raw?: any } | null> {
        return naviApi.naviHitTest(this._transport, args);
    }

    /** Atom-pick click handler; updates the status-bar message. */
    naviClickAtom(args: { viewId: number; x: number; y: number }): Promise<{ handled: boolean; statusMessage?: string; hitres?: any } | null> {
        return naviApi.naviClickAtom(this._transport, args);
    }

    /** Residue-selection click handler (toggle / extend). */
    naviResidSel(args: {
        viewId: number; x: number; y: number;
        mode: 'toggle' | 'extend';
        prevObjId?: number; prevAtomId?: number;
    }): Promise<{ handled: boolean; objId?: number; atomId?: number } | null> {
        return naviApi.naviResidSel(this._transport, args);
    }

    /** Move the view center to the world coord at `(x, y, z)`. */
    naviCenterAt(args: { viewId: number; x: number; y: number; z: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCenterAt(this._transport, args);
    }

    /** Move the view center to a symmetry mate of an atom. */
    naviCenterAtSymm(args: {
        viewId: number; objId: number; rendId: number; atomId: number; symmId: number;
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCenterAtSymm(this._transport, args);
    }

    /** Context-menu "select" -- replaces the selection on the object. */
    naviCtxSelect(args: {
        viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol';
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxSelect(this._transport, args);
    }

    /** Context-menu "add to selection" -- adds without replacing. */
    naviCtxAddSelect(args: {
        viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol';
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxAddSelect(this._transport, args);
    }

    /** Context-menu "unselect" -- clear the object's selection. */
    naviCtxUnselect(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxUnselect(this._transport, args);
    }

    /** Context-menu "invert selection". */
    naviCtxInvertSel(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxInvertSel(this._transport, args);
    }

    /** Context-menu "toggle side-chain selection". */
    naviCtxToggleSidechain(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxToggleSidechain(this._transport, args);
    }

    /** Context-menu "select within N angstroms". */
    naviCtxAround(args: {
        viewId: number; objId: number; distance: number; byres: boolean;
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxAround(this._transport, args);
    }
}
