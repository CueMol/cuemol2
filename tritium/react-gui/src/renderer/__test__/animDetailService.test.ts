/**
 * Degrade-detection tests for `animDetail.service` (anim-element detail inspector).
 *
 * Pins the load-bearing contracts:
 *   - elements resolve by STABLE uid (linear scan), not by index;
 *   - a vanished uid yields { ok:false, gone:true };
 *   - `timing` writes relative start/end (min<=max) + resolveRelTime in a txn;
 *   - `axis` builds a Vector via createObj('Vector');
 *   - booleans are coerced (1/0 -> true/false), never raw-assigned;
 *   - `tgtAlpha` maps to the C++ snake key `tgt_alpha`;
 *   - a resolveRelTime throw does not roll back the field edit;
 *   - getAnimTargetOptions flattens renderers / filters MorphMol / lists cameras.
 */

import { describe, it, expect, vi } from "vitest";
import type { WorkerContext } from "../worker/server/types/WorkerContext";

// Control the scene-tree parse directly (its own parsing is tested elsewhere).
let mockTree: unknown = null;
vi.mock("../worker/shared/sceneTreeTypes", () => ({
  parseSceneTreeJSON: () => mockTree,
}));

import { services } from "../worker/server/services/animDetail.service";

function tv(ms: number) {
  return { millisec: ms };
}

interface ObjSpec {
  uid: number;
  name: string;
  className: string;
  disabled?: boolean;
  timeRefName?: string;
  startMs?: number;
  endMs?: number;
  quadric?: number;
  props?: Record<string, unknown>;
}

function makeObj(o: ObjSpec): Record<string, unknown> {
  return {
    uid: o.uid,
    name: o.name,
    disabled: o.disabled ?? false,
    timeRefName: o.timeRefName ?? "",
    start: tv(o.startMs ?? 0),
    end: tv(o.endMs ?? 1000),
    quadric: o.quadric ?? 0,
    getClassName: () => o.className,
    ...(o.props ?? {}),
  };
}

function makeCtx(opts: {
  objs?: Record<string, unknown>[];
  noScene?: boolean;
  resolveThrows?: boolean;
  cameraInfoJSON?: string;
}) {
  const objs = opts.objs ?? [];
  const resolveRelTime = vi.fn(() => {
    if (opts.resolveThrows) throw new Error("cyclic timeRefName");
  });
  const getAt = vi.fn((i: number) => objs[i]);
  const mgr = { size: objs.length, getAt, resolveRelTime };
  const startUndoTxn = vi.fn();
  const commitUndoTxn = vi.fn();
  const rollbackUndoTxn = vi.fn();
  const getSceneDataJSON = vi.fn(() => "[]");
  const getCameraInfoJSON = vi.fn(() => opts.cameraInfoJSON ?? "[]");
  const scene = {
    getAnimMgr: () => mgr,
    startUndoTxn,
    commitUndoTxn,
    rollbackUndoTxn,
    getSceneDataJSON,
    getCameraInfoJSON,
  };
  const createdTV: { millisec: number }[] = [];
  const createdVec: Record<string, number>[] = [];
  const createObj = vi.fn((cls: string) => {
    if (cls === "TimeValue") {
      const t = { millisec: 0 };
      createdTV.push(t);
      return t;
    }
    if (cls === "Vector") {
      const v: Record<string, number> = { x: 0, y: 0, z: 0 };
      createdVec.push(v);
      return v;
    }
    return null;
  });
  const ctx = {
    sceMgr: { getScene: () => (opts.noScene ? null : scene) },
    svc: { createObj },
  } as unknown as WorkerContext;
  return { ctx, resolveRelTime, startUndoTxn, commitUndoTxn, createdTV, createdVec, createObj, objs };
}

describe("animDetail.service getAnimElementDetail", () => {
  it("resolves by uid (not index) and reads common + type props + siblings", () => {
    const objs = [
      makeObj({ uid: 10, name: "Cam0", className: "CamMotion", props: { endcam: "camA", ignorerotate: true } }),
      makeObj({ uid: 20, name: "Spin1", className: "SimpleSpin", startMs: 100, endMs: 1100, quadric: 0.2, props: { angle: 270, axis: { x: 0, y: 1, z: 0 } } }),
    ];
    const { ctx } = makeCtx({ objs });
    const res = services.getAnimElementDetail(ctx, { sceneId: 1, uid: 20 });
    expect(res.ok).toBe(true);
    expect(res.detail!.common).toMatchObject({ uid: 20, name: "Spin1", type: "SimpleSpin", startMs: 100, endMs: 1100, quadric: 0.2 });
    expect(res.detail!.typeProps).toMatchObject({ angle: 270, axisX: 0, axisY: 1, axisZ: 0 });
    expect(res.detail!.siblings).toEqual([{ name: "Cam0" }]);
  });

  it("returns gone:true when the uid is not in the manager", () => {
    const objs = [makeObj({ uid: 10, name: "A", className: "NoopAnimObj" })];
    const { ctx } = makeCtx({ objs });
    expect(services.getAnimElementDetail(ctx, { sceneId: 1, uid: 999 })).toEqual({ ok: false, gone: true });
  });
});

describe("animDetail.service setAnimElementProp", () => {
  it("timing writes relative start/end (min<=max) + resolveRelTime, in an undo txn", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "SimpleSpin" })];
    const { ctx, resolveRelTime, startUndoTxn, commitUndoTxn, createdTV } = makeCtx({ objs });
    const res = services.setAnimElementProp(ctx, { sceneId: 1, uid: 5, prop: "timing", value: { startMs: 2000, endMs: 500 } });
    expect(startUndoTxn).toHaveBeenCalledWith("Change animation: timing");
    expect(commitUndoTxn).toHaveBeenCalled();
    expect(createdTV[0].millisec).toBe(500);
    expect(createdTV[1].millisec).toBe(2000);
    expect(objs[0].start).toBe(createdTV[0]);
    expect(objs[0].end).toBe(createdTV[1]);
    expect(resolveRelTime).toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.detail).toBeDefined();
  });

  it("axis builds a Vector via createObj('Vector') and assigns it", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "SimpleSpin", props: { angle: 0, axis: { x: 1, y: 0, z: 0 } } })];
    const { ctx, createObj, createdVec } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 5, prop: "axis", value: { x: 0, y: 0, z: 1 } });
    expect(createObj).toHaveBeenCalledWith("Vector");
    expect(createdVec[0]).toMatchObject({ x: 0, y: 0, z: 1 });
    expect(objs[0].axis).toBe(createdVec[0]);
  });

  it("coerces booleans (1/0 -> true/false), never raw assign", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "ShowHideAnim", props: { hide: false, fade: true, rend: "", tgt_alpha: 1 } })];
    const { ctx } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 5, prop: "hide", value: 1 as unknown as boolean });
    expect(objs[0].hide).toBe(true);
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 5, prop: "hide", value: 0 as unknown as boolean });
    expect(objs[0].hide).toBe(false);
  });

  it("tgtAlpha maps to the C++ snake key tgt_alpha", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "ShowHideAnim", props: { tgt_alpha: 1 } })];
    const { ctx } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 5, prop: "tgtAlpha", value: 0.5 });
    expect(objs[0].tgt_alpha).toBe(0.5);
  });

  it("swallows a resolveRelTime throw so the field edit still commits", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "SimpleSpin" })];
    const { ctx, commitUndoTxn } = makeCtx({ objs, resolveThrows: true });
    const res = services.setAnimElementProp(ctx, { sceneId: 1, uid: 5, prop: "timeRefName", value: "B" });
    expect(objs[0].timeRefName).toBe("B");
    expect(commitUndoTxn).toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it("returns gone:true when the uid vanished", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "SimpleSpin" })];
    const { ctx } = makeCtx({ objs });
    const res = services.setAnimElementProp(ctx, { sceneId: 1, uid: 999, prop: "name", value: "X" });
    expect(res).toMatchObject({ ok: false, gone: true });
  });
});

describe("animDetail.service getAnimTargetOptions", () => {
  it("flattens renderers (incl groups), filters MorphMol mols, lists cameras", () => {
    mockTree = {
      type: "scene",
      children: [
        {
          type: "object",
          name: "Mol1",
          className: "MorphMol",
          children: [{ type: "renderer", name: "rend1", className: "cartoon", children: [] }],
        },
        {
          type: "object",
          name: "Map1",
          className: "DensityMap",
          children: [
            {
              type: "rendGroup",
              name: "g",
              className: "",
              children: [{ type: "renderer", name: "rend2", className: "isosurf", children: [] }],
            },
          ],
        },
      ],
    };
    const { ctx } = makeCtx({ cameraInfoJSON: JSON.stringify([{ name: "camA" }, { name: "" }, { name: "camB" }]) });
    const res = services.getAnimTargetOptions(ctx, { sceneId: 1 });
    expect(res.ok).toBe(true);
    expect(res.mols).toEqual([{ name: "Mol1" }]);
    expect(res.renderers).toEqual([
      { name: "rend1", objName: "Mol1", type: "cartoon" },
      { name: "rend2", objName: "Map1", type: "isosurf" },
    ]);
    expect(res.cameras).toEqual([{ name: "camA" }, { name: "camB" }]);
  });
});
