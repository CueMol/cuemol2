/**
 * Degrade-detection tests for `animation.service` (worker, read-only).
 *
 * Pins the AnimMgr -> AnimElement[] wire contract the timeline panel depends on:
 *   - `resolveRelTime()` is called once (relative->absolute) before reading,
 *     and a throw from it is swallowed (one bad element can't blank the panel);
 *   - each `AnimObj` maps to a strip element with all times read in ms
 *     (`start.millisec` / `absStart.millisec` / ...), the subtype from
 *     `getClassName()`, and `getAt(i)` called `size` times;
 *   - `playState` accepts the native string enum and the numeric fallback;
 *   - a missing scene yields an empty timeline.
 */

import { describe, it, expect, vi } from "vitest";
import type { WorkerContext } from "../worker/server/types/WorkerContext";
import { services } from "../worker/server/services/animation.service";

function tv(ms: number) {
  return { millisec: ms };
}

interface ObjSpec {
  uid: number;
  name: string;
  className: string;
  disabled?: boolean;
  timeRefName?: string;
  start: number;
  end: number;
  absStart: number;
  absEnd: number;
  quadric?: number;
}

function makeObj(o: ObjSpec) {
  return {
    uid: o.uid,
    name: o.name,
    disabled: o.disabled ?? false,
    timeRefName: o.timeRefName ?? "",
    start: tv(o.start),
    end: tv(o.end),
    absStart: tv(o.absStart),
    absEnd: tv(o.absEnd),
    quadric: o.quadric ?? 0,
    getClassName: () => o.className,
  };
}

function makeCtx(opts: {
  objs?: ReturnType<typeof makeObj>[];
  playState?: unknown;
  lengthMs?: number;
  elapsedMs?: number;
  loop?: boolean;
  startcam?: string;
  /** Cameras the scene already owns (drives hasCamera + getCameraInfoJSON). */
  cameras?: string[];
  /** Overrides the JSON derived from `cameras` (malformed-payload cases). */
  cameraInfoJSON?: string;
  /** Make saveViewToCam a no-op, as if the camera could not be created. */
  saveViewToCamFails?: boolean;
  resolveThrows?: boolean;
  noScene?: boolean;
  noView?: boolean;
}) {
  const objs = opts.objs ?? [];
  const resolveRelTime = vi.fn(() => {
    if (opts.resolveThrows) throw new Error("cyclic timeRefName");
  });
  const getAt = vi.fn((i: number) => objs[i]);
  const start = vi.fn();
  const pause = vi.fn();
  const stop = vi.fn();
  const goTime = vi.fn();
  const append = vi.fn();
  const insertBefore = vi.fn();
  const removeAt = vi.fn();
  const getByName = vi.fn(() => null);
  const mgr = {
    size: objs.length,
    length: tv(opts.lengthMs ?? 0),
    elapsed: tv(opts.elapsedMs ?? 0),
    playState: opts.playState ?? "stop",
    loop: opts.loop ?? false,
    startcam: opts.startcam ?? "",
    resolveRelTime,
    getAt,
    start,
    pause,
    stop,
    goTime,
    append,
    insertBefore,
    removeAt,
    getByName,
  };
  const startUndoTxn = vi.fn();
  const commitUndoTxn = vi.fn();
  const rollbackUndoTxn = vi.fn();
  const sceneCameras = new Set(opts.cameras ?? []);
  const getCameraInfoJSON = vi.fn(
    () =>
      opts.cameraInfoJSON ??
      JSON.stringify([...sceneCameras].map((name) => ({ name, vis_size: 0 }))),
  );
  const hasCamera = vi.fn((name: string) => sceneCameras.has(name));
  const saveViewToCam = vi.fn((_viewId: number, name: string) => {
    if (opts.saveViewToCamFails) return false;
    sceneCameras.add(name);
    return true;
  });
  const scene = {
    getAnimMgr: () => mgr,
    getCameraInfoJSON,
    hasCamera,
    saveViewToCam,
    startUndoTxn,
    commitUndoTxn,
    rollbackUndoTxn,
  };
  const view = { __view: true };
  // Each createObj('TimeValue') yields a fresh value (recorded in order); any
  // other class yields the shared `createdObj` (the new AnimObj under test).
  const createdTimeValues: { millisec: number }[] = [];
  const createdObj: Record<string, unknown> = { uid: 4242, name: "", timeRefName: "" };
  const createObj = vi.fn((cls: string) => {
    if (cls === "TimeValue") {
      const t = { millisec: 0 };
      createdTimeValues.push(t);
      return t;
    }
    return createdObj;
  });
  const ctx = {
    sceMgr: {
      getScene: () => (opts.noScene ? null : scene),
      getView: () => (opts.noView ? null : view),
    },
    svc: { createObj },
  } as unknown as WorkerContext;
  return {
    ctx, mgr, getAt, resolveRelTime, start, pause, stop, goTime,
    append, insertBefore, removeAt, getByName, getCameraInfoJSON, hasCamera, saveViewToCam,
    startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    view, createdTimeValues, createdObj, createObj,
  };
}

describe("animation.service animListTimeline", () => {
  it("maps each AnimObj to a strip element (ms), resolving relative times first", () => {
    const objs = [
      makeObj({ uid: 11, name: "Cam0", className: "CamMotion", start: 0, end: 1000, absStart: 0, absEnd: 1000 }),
      makeObj({ uid: 12, name: "Spin1", className: "SimpleSpin", start: 0, end: 2000, absStart: 1000, absEnd: 3000, timeRefName: "Cam0" }),
    ];
    const { ctx, getAt, resolveRelTime } = makeCtx({ objs, lengthMs: 3000 });
    const res = services.animListTimeline(ctx, { sceneId: 1 });

    expect(resolveRelTime).toHaveBeenCalledTimes(1);
    expect(getAt).toHaveBeenCalledTimes(2);
    expect(res.elements).toHaveLength(2);
    expect(res.elements[0]).toMatchObject({
      index: 0,
      uid: 11,
      name: "Cam0",
      type: "CamMotion",
      startMs: 0,
      endMs: 1000,
      absStartMs: 0,
      absEndMs: 1000,
      timeRefName: "",
    });
    expect(res.elements[1]).toMatchObject({
      index: 1,
      uid: 12,
      name: "Spin1",
      type: "SimpleSpin",
      absStartMs: 1000,
      absEndMs: 3000,
      timeRefName: "Cam0",
    });
    expect(res.mgr.lengthMs).toBe(3000);
    expect(res.fps).toBe(30);
  });

  it("derives the element type from getClassName()", () => {
    const objs = [makeObj({ uid: 1, name: "Fade", className: "ShowHideAnim", start: 0, end: 500, absStart: 0, absEnd: 500 })];
    const { ctx } = makeCtx({ objs });
    const res = services.animListTimeline(ctx, { sceneId: 1 });
    expect(res.elements[0].type).toBe("ShowHideAnim");
  });

  it("swallows a resolveRelTime() throw and still lists elements", () => {
    const objs = [makeObj({ uid: 1, name: "X", className: "NoopAnimObj", start: 0, end: 0, absStart: 0, absEnd: 0 })];
    const { ctx } = makeCtx({ objs, resolveThrows: true });
    expect(() => services.animListTimeline(ctx, { sceneId: 1 })).not.toThrow();
    const res = services.animListTimeline(ctx, { sceneId: 1 });
    expect(res.elements).toHaveLength(1);
  });

  it("returns an empty timeline when the scene is missing", () => {
    const { ctx } = makeCtx({ noScene: true });
    const res = services.animListTimeline(ctx, { sceneId: 99 });
    expect(res.elements).toEqual([]);
    expect(res.sceneId).toBe(99);
  });

  it("lists the scene camera names for the start-camera selector", () => {
    const { ctx } = makeCtx({ cameras: ["front", "back"], startcam: "back" });
    const res = services.animListTimeline(ctx, { sceneId: 1 });
    expect(res.cameras).toEqual(["front", "back"]);
    expect(res.mgr.startcam).toBe("back");
  });

  it("yields no cameras when getCameraInfoJSON is unparsable", () => {
    const { ctx } = makeCtx({ cameraInfoJSON: "not json" });
    expect(services.animListTimeline(ctx, { sceneId: 1 }).cameras).toEqual([]);
  });

  it("maps the numeric playState fallback (1 -> play)", () => {
    const { ctx } = makeCtx({ objs: [], playState: 1, elapsedMs: 250, lengthMs: 1000 });
    const res = services.animListTimeline(ctx, { sceneId: 1 });
    expect(res.mgr.playState).toBe("play");
    expect(res.mgr.elapsedMs).toBe(250);
  });
});

describe("animation.service animGetMgrState", () => {
  it("reads the manager snapshot (string playState passes through)", () => {
    const { ctx } = makeCtx({ playState: "pause", lengthMs: 4000, elapsedMs: 1200, loop: true, startcam: "cam1" });
    const res = services.animGetMgrState(ctx, { sceneId: 1 });
    expect(res).toEqual({
      lengthMs: 4000,
      elapsedMs: 1200,
      playState: "pause",
      loop: true,
      startcam: "cam1",
    });
  });
});

describe("animation.service transport", () => {
  it("animPlay resolves the view and calls mgr.start(view), returning the snapshot", () => {
    const { ctx, start, view } = makeCtx({ playState: "play", lengthMs: 5000 });
    const res = services.animPlay(ctx, { sceneId: 1, viewId: 2 });
    expect(start).toHaveBeenCalledWith(view);
    expect(res.ok).toBe(true);
    expect(res.mgr.playState).toBe("play");
  });

  it("animPlay fails (ok:false) without an active view, never calling start", () => {
    const { ctx, start } = makeCtx({ noView: true });
    const res = services.animPlay(ctx, { sceneId: 1, viewId: 999 });
    expect(start).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });

  it("animPause / animStop call the matching AnimMgr method", () => {
    const a = makeCtx({});
    expect(services.animPause(a.ctx, { sceneId: 1 }).ok).toBe(true);
    expect(a.pause).toHaveBeenCalledTimes(1);
    const b = makeCtx({});
    expect(services.animStop(b.ctx, { sceneId: 1 }).ok).toBe(true);
    expect(b.stop).toHaveBeenCalledTimes(1);
  });

  it("animGoTime builds a TimeValue(ms) and calls goTime(tv, view)", () => {
    const { ctx, goTime, view, createdTimeValues, createObj } = makeCtx({});
    const res = services.animGoTime(ctx, { sceneId: 1, viewId: 2, ms: 1500 });
    expect(createObj).toHaveBeenCalledWith("TimeValue");
    expect(createdTimeValues[0].millisec).toBe(1500);
    expect(goTime).toHaveBeenCalledWith(createdTimeValues[0], view);
    expect(res.ok).toBe(true);
  });

  it("animGoTime clamps negative ms to 0", () => {
    const { ctx, createdTimeValues } = makeCtx({});
    services.animGoTime(ctx, { sceneId: 1, viewId: 2, ms: -500 });
    expect(createdTimeValues[0].millisec).toBe(0);
  });

  it("animSetLoop writes mgr.loop and returns it", () => {
    const { ctx, mgr } = makeCtx({ loop: false });
    const res = services.animSetLoop(ctx, { sceneId: 1, loop: true });
    expect(mgr.loop).toBe(true);
    expect(res.mgr.loop).toBe(true);
  });

  it("animSetStartCam writes mgr.startcam and returns it, outside any undo txn", () => {
    const { ctx, mgr, startUndoTxn } = makeCtx({ startcam: "" });
    const res = services.animSetStartCam(ctx, { sceneId: 1, startcam: "front" });
    expect(mgr.startcam).toBe("front");
    expect(res.mgr.startcam).toBe("front");
    // setStartCamName records nothing undoable; a txn would only be discarded.
    expect(startUndoTxn).not.toHaveBeenCalled();
  });

  it("animSetStartCam clears the start camera with an empty name", () => {
    const { ctx, mgr } = makeCtx({ startcam: "front" });
    expect(services.animSetStartCam(ctx, { sceneId: 1, startcam: "" }).ok).toBe(true);
    expect(mgr.startcam).toBe("");
  });

  it("transport ops fail safely when the scene is missing", () => {
    const { ctx } = makeCtx({ noScene: true });
    expect(services.animPlay(ctx, { sceneId: 9, viewId: 1 }).ok).toBe(false);
    expect(services.animStop(ctx, { sceneId: 9 }).ok).toBe(false);
  });
});

describe("animation.service editing", () => {
  it("animSetElementTime sets relative start<=end and resolves, in an undo txn", () => {
    const objs = [makeObj({ uid: 1, name: "A", className: "SimpleSpin", start: 0, end: 1000, absStart: 0, absEnd: 1000 })];
    const { ctx, resolveRelTime, startUndoTxn, commitUndoTxn, createdTimeValues } = makeCtx({ objs });
    const res = services.animSetElementTime(ctx, { sceneId: 1, index: 0, startMs: 2000, endMs: 500 });
    expect(startUndoTxn).toHaveBeenCalledWith("Move animation element");
    expect(commitUndoTxn).toHaveBeenCalled();
    expect(createdTimeValues[0].millisec).toBe(500); // start = min
    expect(createdTimeValues[1].millisec).toBe(2000); // end = max
    expect(objs[0].start).toBe(createdTimeValues[0]);
    expect(objs[0].end).toBe(createdTimeValues[1]);
    expect(resolveRelTime).toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it("animAddElement creates the class, auto-chains to prev, appends, in an undo txn", () => {
    const objs = [makeObj({ uid: 1, name: "Cam0", className: "CamMotion", start: 0, end: 1000, absStart: 0, absEnd: 1000 })];
    const { ctx, createObj, createdObj, append, startUndoTxn } = makeCtx({ objs });
    const res = services.animAddElement(ctx, { sceneId: 1, type: "SimpleSpin" });
    expect(startUndoTxn).toHaveBeenCalledWith("Add animation element");
    expect(createObj).toHaveBeenCalledWith("SimpleSpin");
    expect(createdObj.name).toBe("SimpleSpin0"); // uniqueName
    expect(createdObj.timeRefName).toBe("Cam0"); // auto-chain to previous
    expect(createdObj.angle).toBe(360); // SimpleSpin default
    expect(append).toHaveBeenCalledWith(createdObj);
    expect(res.ok).toBe(true);
    expect(res.uid).toBe(4242);
  });

  it("animAddElement maps Hide -> ShowHideAnim(hide=true) and inserts at insertIndex", () => {
    const objs = [
      makeObj({ uid: 1, name: "A", className: "SimpleSpin", start: 0, end: 1000, absStart: 0, absEnd: 1000 }),
      makeObj({ uid: 2, name: "B", className: "SimpleSpin", start: 0, end: 1000, absStart: 0, absEnd: 1000 }),
    ];
    const { ctx, createObj, createdObj, insertBefore } = makeCtx({ objs });
    services.animAddElement(ctx, { sceneId: 1, type: "HideAnim", insertIndex: 1 });
    expect(createObj).toHaveBeenCalledWith("ShowHideAnim");
    expect(createdObj.hide).toBe(true);
    expect(insertBefore).toHaveBeenCalledWith(1, createdObj);
  });

  it("animRemoveElement calls removeAt in an undo txn", () => {
    const objs = [makeObj({ uid: 1, name: "A", className: "SimpleSpin", start: 0, end: 1000, absStart: 0, absEnd: 1000 })];
    const { ctx, removeAt, startUndoTxn } = makeCtx({ objs });
    const res = services.animRemoveElement(ctx, { sceneId: 1, index: 0 });
    expect(startUndoTxn).toHaveBeenCalledWith("Delete animation element");
    expect(removeAt).toHaveBeenCalledWith(0);
    expect(res.ok).toBe(true);
  });

  it("animMoveElement removes then re-inserts at the target index", () => {
    const objs = [
      makeObj({ uid: 1, name: "A", className: "SimpleSpin", start: 0, end: 1000, absStart: 0, absEnd: 1000 }),
      makeObj({ uid: 2, name: "B", className: "SimpleSpin", start: 0, end: 1000, absStart: 0, absEnd: 1000 }),
    ];
    const { ctx, removeAt, insertBefore } = makeCtx({ objs });
    const res = services.animMoveElement(ctx, { sceneId: 1, from: 1, to: 0 });
    expect(removeAt).toHaveBeenCalledWith(1);
    expect(insertBefore).toHaveBeenCalledWith(0, objs[1]);
    expect(res.ok).toBe(true);
  });

  it("animAddElement seeds __current from the view and adopts it as startcam", () => {
    const { ctx, mgr, saveViewToCam, startUndoTxn } = makeCtx({ startcam: "" });
    const res = services.animAddElement(ctx, {
      sceneId: 1, type: "SimpleSpin", viewId: 7,
    });
    expect(saveViewToCam).toHaveBeenCalledWith(7, "__current");
    expect(mgr.startcam).toBe("__current");
    expect(res.mgr?.startcam).toBe("__current");
    // UXP seeds the camera before the element edit, outside its undo txn.
    expect(saveViewToCam.mock.invocationCallOrder[0]).toBeLessThan(
      startUndoTxn.mock.invocationCallOrder[0],
    );
  });

  it("animAddElement keeps an existing __current and never overwrites a set startcam", () => {
    const { ctx, mgr, saveViewToCam } = makeCtx({
      cameras: ["__current", "front"], startcam: "front",
    });
    services.animAddElement(ctx, { sceneId: 1, type: "SimpleSpin", viewId: 7 });
    expect(saveViewToCam).not.toHaveBeenCalled();
    expect(mgr.startcam).toBe("front");
  });

  it("animAddElement leaves the start camera alone without an active view", () => {
    const { ctx, mgr, saveViewToCam } = makeCtx({ startcam: "" });
    services.animAddElement(ctx, { sceneId: 1, type: "SimpleSpin" });
    expect(saveViewToCam).not.toHaveBeenCalled();
    expect(mgr.startcam).toBe("");
  });

  it("animAddElement does not point startcam at a camera the save failed to create", () => {
    const { ctx, mgr, append } = makeCtx({ startcam: "", saveViewToCamFails: true });
    const res = services.animAddElement(ctx, {
      sceneId: 1, type: "SimpleSpin", viewId: 7,
    });
    expect(mgr.startcam).toBe("");
    expect(append).toHaveBeenCalled(); // the add itself still goes through
    expect(res.ok).toBe(true);
  });

  it("editing ops fail safely when the scene is missing", () => {
    const { ctx } = makeCtx({ noScene: true });
    expect(services.animRemoveElement(ctx, { sceneId: 9, index: 0 }).ok).toBe(false);
    expect(services.animAddElement(ctx, { sceneId: 9, type: "NoopAnimObj" }).ok).toBe(false);
  });
});
