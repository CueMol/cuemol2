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
  };
  const scene = { getAnimMgr: () => mgr };
  const view = { __view: true };
  const timeValue = { millisec: 0 };
  const createObj = vi.fn((cls: string) => (cls === "TimeValue" ? timeValue : null));
  const ctx = {
    sceMgr: {
      getScene: () => (opts.noScene ? null : scene),
      getView: () => (opts.noView ? null : view),
    },
    svc: { createObj },
  } as unknown as WorkerContext;
  return { ctx, mgr, getAt, resolveRelTime, start, pause, stop, goTime, view, timeValue, createObj };
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
    const { ctx, goTime, view, timeValue, createObj } = makeCtx({});
    const res = services.animGoTime(ctx, { sceneId: 1, viewId: 2, ms: 1500 });
    expect(createObj).toHaveBeenCalledWith("TimeValue");
    expect(timeValue.millisec).toBe(1500);
    expect(goTime).toHaveBeenCalledWith(timeValue, view);
    expect(res.ok).toBe(true);
  });

  it("animGoTime clamps negative ms to 0", () => {
    const { ctx, timeValue } = makeCtx({});
    services.animGoTime(ctx, { sceneId: 1, viewId: 2, ms: -500 });
    expect(timeValue.millisec).toBe(0);
  });

  it("animSetLoop writes mgr.loop and returns it", () => {
    const { ctx, mgr } = makeCtx({ loop: false });
    const res = services.animSetLoop(ctx, { sceneId: 1, loop: true });
    expect(mgr.loop).toBe(true);
    expect(res.mgr.loop).toBe(true);
  });

  it("transport ops fail safely when the scene is missing", () => {
    const { ctx } = makeCtx({ noScene: true });
    expect(services.animPlay(ctx, { sceneId: 9, viewId: 1 }).ok).toBe(false);
    expect(services.animStop(ctx, { sceneId: 9 }).ok).toBe(false);
  });
});
