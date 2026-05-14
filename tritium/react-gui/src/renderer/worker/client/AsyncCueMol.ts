import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { SceneBgColor, ViewCenterMark } from '../../../shared/ipcTypes';
import type { FileOpenOptions } from '../../components/fopen-opt-dlgs/types';
import { ObjTuple } from '../shared/ObjTuple';
import { ObjProxy } from './ObjProxy';
import { WorkerTransport, type StreamProgressListener } from './WorkerTransport';
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

export class AsyncCueMol {
    private _transport: WorkerTransport;
    private _slots: EventSlots;
    private _factory: ObjectFactory;

    constructor() {
        this._slots = new EventSlots();
        this._transport = new WorkerTransport({
            onEventNotify: (args) => this._slots.notify(...args),
        });
        this._factory = new ObjectFactory(this._transport, this);
    }

    // -------- Transport facade (preserves test surface + ObjProxy contract)
    isReady(): boolean { return this._transport.isReady(); }
    isBusy(): boolean { return this._transport.isBusy(); }
    subscribeBusy(cb: (busy: boolean) => void): () => void { return this._transport.subscribeBusy(cb); }
    subscribeStreamProgress(cb: StreamProgressListener): () => void {
        return this._transport.subscribeStreamProgress(cb);
    }
    invokeWorker(method: string, ...args: any[]): Promise<any[]> {
        return this._transport.invokeWorker(method, ...args);
    }
    invokeWorkerWithTransfer(method: string, transfer: any, ...args: any[]): Promise<any[]> {
        return this._transport.invokeWorkerWithTransfer(method, transfer, ...args);
    }
    invokeService<K extends ServiceKey>(name: K, args: ServiceArgs<K>): Promise<ServiceResult<K>> {
        return this._transport.invokeService(name, args);
    }
    invokeMethodTyped<K extends MethodKey>(name: K, ...args: MethodArgs<K>): Promise<MethodResult<K>> {
        return this._transport.invokeMethod(name, ...args);
    }
    invokeRpc<K extends RpcKey>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
        return this._transport.invokeRpc(name, ...args);
    }
    postMessage(method: string, seq: number, args: any[], xfer: any = null): void {
        this._transport.postMessage(method, seq, args, xfer);
    }
    getSeqNo(): number { return this._transport.getSeqNo(); }
    addListener(method: string, seqno: number, handler: any): void {
        this._transport.addListener(method, seqno, handler);
    }

    // -------- Factory facade (preserves BaseWrapper._utils contract)
    createWrapperImpl(obj: ObjProxy): BaseWrapper { return this._factory.createWrapperImpl(obj); }
    createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> { return this._factory.createWrapper(prom); }
    getWrapped(obj: ObjProxy): ObjTuple { return this._factory.getWrapped(obj); }
    createObj(className: string): Promise<BaseWrapper | null> { return this._factory.createObj(className); }
    getService(className: string): Promise<BaseWrapper | null> { return this._factory.getService(className); }
    hasClass(className: string): Promise<boolean | null> { return this._factory.hasClass(className); }
    getAllClassNamesJSON(): Promise<string | null> { return this._factory.getAllClassNamesJSON(); }

    // -------- Event subscription
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
    async removeEventListener(nID: number): Promise<void> {
        await this._transport.invokeWorker('removeEventListener', nID);
        this._slots.unregister(nID);
        log.info("EventManager, unload slot: " + nID);
    }
    eventNotify(
        slot: number, category: string, srcCat: number, evtType: number, srcUID: number, evtStr: string,
    ): any {
        return this._slots.notify(slot, category, srcCat, evtType, srcUID, evtStr);
    }

    // -------- Lifecycle
    initCueMol(sysConfigPath?: string): Promise<void> { return lifecycleApi.initCueMol(this._transport, sysConfigPath); }
    loadUserStyle(userStylePath?: string): Promise<boolean> { return lifecycleApi.loadUserStyle(this._transport, userStylePath); }
    setViewInputConfigStyle(styleName: string): Promise<boolean> { return lifecycleApi.setViewInputConfigStyle(this._transport, styleName); }
    terminateWorker(): Promise<void> { return lifecycleApi.terminateWorker(this._transport); }
    getAppInfo(): Promise<{ version: string; build: string }> { return lifecycleApi.getAppInfo(this._transport); }

    // -------- View lifecycle
    bindCanvas(canvas: any, view_id: number, dpr: number): Promise<any[]> { return viewApi.bindCanvas(this._transport, canvas, view_id, dpr); }
    addView(view_id: number, dpr: number): Promise<boolean> { return viewApi.addView(this._transport, view_id, dpr); }
    activateView(view_id: number): Promise<void> { return viewApi.activateView(this._transport, view_id); }
    removeView(view_id: number): Promise<void> { return viewApi.removeView(this._transport, view_id); }
    resized(view_id: number, w: number, h: number, dpr: number): void { viewApi.resized(this._transport, view_id, w, h, dpr); }

    // -------- Input events (fire-and-forget)
    onMouseEvent(view_id: number, method: string, event: any): void { inputApi.onMouseEvent(this._transport, view_id, method, event); }
    onWheelEvent(view_id: number, event: any): void { inputApi.onWheelEvent(this._transport, view_id, event); }
    onGestureEvent(view_id: number, axisID: number, delta: number, event?: any): void {
        inputApi.onGestureEvent(this._transport, view_id, axisID, delta, event);
    }

    // -------- File operations
    getCompatibleRendererNames(filePath: string, readerName?: string): Promise<GetCompatibleRendererNamesResult> {
        return fileApi.getCompatibleRendererNames(this._transport, filePath, readerName);
    }
    getOpenFilters(catId: number): Promise<ElectronFileFilter[]> { return fileApi.getOpenFilters(this._transport, catId); }
    createNewSceneAndView(dpr: number, name?: string, bindView?: boolean): Promise<{ scene_uid: number; view_uid: number; scene_name: string; view_name: string } | null> {
        return fileApi.createNewSceneAndView(this._transport, dpr, name, bindView);
    }
    loadScene(filePath: string, scene_id: number): Promise<boolean> { return fileApi.loadScene(this._transport, filePath, scene_id); }
    loadObject(filePath: string, scene_id: number, options: FileOpenOptions): Promise<boolean> {
        return fileApi.loadObject(this._transport, filePath, scene_id, options);
    }

    // -------- Edit
    undo(scene_id: number, depth = 0): Promise<boolean> { return editApi.undo(this._transport, scene_id, depth); }
    redo(scene_id: number, depth = 0): Promise<boolean> { return editApi.redo(this._transport, scene_id, depth); }

    // -------- Scene / View settings
    getViewProjection(viewId: number): Promise<{ ok: boolean; perspective: boolean } | null> {
        return sceneViewApi.getViewProjection(this._transport, viewId);
    }
    setViewProjection(viewId: number, perspective: boolean): Promise<{ ok: boolean; perspective: boolean } | null> {
        return sceneViewApi.setViewProjection(this._transport, viewId, perspective);
    }
    getViewCenterMark(viewId: number): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
        return sceneViewApi.getViewCenterMark(this._transport, viewId);
    }
    setViewCenterMark(viewId: number, centerMark: ViewCenterMark): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
        return sceneViewApi.setViewCenterMark(this._transport, viewId, centerMark);
    }
    getSceneBgColor(sceneId: number): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
        return sceneViewApi.getSceneBgColor(this._transport, sceneId);
    }
    setSceneBgColor(sceneId: number, colorName: 'white' | 'black'): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
        return sceneViewApi.setSceneBgColor(this._transport, sceneId, colorName);
    }
    proposeUniqName(args: ProposeUniqNameArgs): Promise<ProposeUniqNameResult | null> {
        return sceneViewApi.proposeUniqName(this._transport, args);
    }
    createViewInScene(args: CreateViewInSceneArgs): Promise<CreateViewInSceneResult | null> {
        return sceneViewApi.createViewInScene(this._transport, args);
    }
    proposeNewTabNames(args: ProposeNewTabNamesArgs): Promise<ProposeNewTabNamesResult | null> {
        return sceneViewApi.proposeNewTabNames(this._transport, args);
    }
    getSceneCloseInfo(viewId: number): Promise<GetSceneCloseInfoResult | null> {
        return sceneViewApi.getSceneCloseInfo(this._transport, { viewId });
    }

    // -------- Navigation tools
    naviHitTest(args: { viewId: number; x: number; y: number }): Promise<{ hit: boolean; raw?: any } | null> {
        return naviApi.naviHitTest(this._transport, args);
    }
    naviClickAtom(args: { viewId: number; x: number; y: number }): Promise<{ handled: boolean; statusMessage?: string; hitres?: any } | null> {
        return naviApi.naviClickAtom(this._transport, args);
    }
    naviResidSel(args: {
        viewId: number; x: number; y: number;
        mode: 'toggle' | 'extend';
        prevObjId?: number; prevAtomId?: number;
    }): Promise<{ handled: boolean; objId?: number; atomId?: number } | null> {
        return naviApi.naviResidSel(this._transport, args);
    }
    naviCenterAt(args: { viewId: number; x: number; y: number; z: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCenterAt(this._transport, args);
    }
    naviCenterAtSymm(args: {
        viewId: number; objId: number; rendId: number; atomId: number; symmId: number;
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCenterAtSymm(this._transport, args);
    }
    naviCtxSelect(args: {
        viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol';
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxSelect(this._transport, args);
    }
    naviCtxAddSelect(args: {
        viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol';
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxAddSelect(this._transport, args);
    }
    naviCtxUnselect(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxUnselect(this._transport, args);
    }
    naviCtxInvertSel(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxInvertSel(this._transport, args);
    }
    naviCtxToggleSidechain(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxToggleSidechain(this._transport, args);
    }
    naviCtxAround(args: {
        viewId: number; objId: number; distance: number; byres: boolean;
    }): Promise<{ ok: boolean } | null> {
        return naviApi.naviCtxAround(this._transport, args);
    }
}
