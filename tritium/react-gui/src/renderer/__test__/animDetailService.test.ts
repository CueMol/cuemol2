/**
 * Degrade-detection tests for `anim.service` (anim-element detail inspector).
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
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";

// Control the scene-tree parse directly (its own parsing is tested elsewhere).
let mockTree: unknown = null;
vi.mock("@renderer/worker/shared/sceneTreeTypes", () => ({
  parseSceneTreeJSON: () => mockTree,
}));

import { services } from "@renderer/worker/server/services/anim/anim.service";

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
  absStartMs?: number;
  absEndMs?: number;
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
    absStart: tv(o.absStartMs ?? o.startMs ?? 0),
    absEnd: tv(o.absEndMs ?? o.endMs ?? 1000),
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

describe("anim.service getAnimElementDetail", () => {
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

describe("anim.service setAnimElementProp", () => {
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

  // A relative element resolves as `abs = ref.absEnd + rel`, so switching the
  // reference has to re-base `rel` or the element jumps to a different time.
  it("re-bases relative -> absolute so the element keeps its place", () => {
    const objs = [
      makeObj({ uid: 10, name: "A", className: "CamMotion", absStartMs: 0, absEndMs: 3000 }),
      makeObj({
        uid: 20, name: "B", className: "SimpleSpin", timeRefName: "A",
        startMs: 1000, endMs: 2000, absStartMs: 4000, absEndMs: 5000,
      }),
    ];
    const { ctx, createdTV } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 20, prop: "timeRefName", value: "" });
    expect(objs[1].timeRefName).toBe("");
    // base 0 -> rel becomes the absolute span it already occupied.
    expect(createdTV[0].millisec).toBe(4000);
    expect(createdTV[1].millisec).toBe(5000);
    expect(objs[1].start).toBe(createdTV[0]);
    expect(objs[1].end).toBe(createdTV[1]);
  });

  it("re-bases absolute -> relative against the new reference's absEnd", () => {
    const objs = [
      makeObj({ uid: 10, name: "A", className: "CamMotion", absStartMs: 0, absEndMs: 3000 }),
      makeObj({
        uid: 20, name: "B", className: "SimpleSpin",
        startMs: 4000, endMs: 5000, absStartMs: 4000, absEndMs: 5000,
      }),
    ];
    const { ctx, createdTV } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 20, prop: "timeRefName", value: "A" });
    expect(objs[1].timeRefName).toBe("A");
    expect(createdTV[0].millisec).toBe(1000); // 4000 - 3000
    expect(createdTV[1].millisec).toBe(2000);
  });

  it("clamps to the reference's end (keeping the duration) instead of a negative rel", () => {
    // B sits BEFORE A ends, so expressing it relative to A would need a
    // negative start -- an unsupported state. B is pulled to A's end.
    const objs = [
      makeObj({ uid: 10, name: "A", className: "CamMotion", absStartMs: 0, absEndMs: 3000 }),
      makeObj({
        uid: 20, name: "B", className: "SimpleSpin",
        startMs: 2500, endMs: 3500, absStartMs: 2500, absEndMs: 3500,
      }),
    ];
    const { ctx, createdTV } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 20, prop: "timeRefName", value: "A" });
    expect(createdTV[0].millisec).toBe(0); // would have been -500
    expect(createdTV[1].millisec).toBe(1000); // duration preserved
  });

  it("leaves the times alone when the new reference name does not exist", () => {
    const objs = [
      makeObj({ uid: 20, name: "B", className: "SimpleSpin", startMs: 0, endMs: 1000 }),
    ];
    const { ctx, createdTV } = makeCtx({ objs });
    services.setAnimElementProp(ctx, { sceneId: 1, uid: 20, prop: "timeRefName", value: "ghost" });
    expect(objs[0].timeRefName).toBe("ghost");
    expect(createdTV).toHaveLength(0); // no re-base attempted
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

  it("rename cascades to siblings referencing the old name by timeRefName (one txn)", () => {
    const objs = [
      makeObj({ uid: 10, name: "A", className: "SimpleSpin" }),
      makeObj({ uid: 20, name: "B", className: "CamMotion", timeRefName: "A" }),
      makeObj({ uid: 30, name: "C", className: "NoopAnimObj", timeRefName: "other" }),
    ];
    const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({ objs });
    const res = services.setAnimElementProp(ctx, { sceneId: 1, uid: 10, prop: "name", value: "A2" });
    expect(objs[0].name).toBe("A2"); // renamed
    expect(objs[1].timeRefName).toBe("A2"); // sibling B follows the rename
    expect(objs[2].timeRefName).toBe("other"); // C (different ref) untouched
    expect(startUndoTxn).toHaveBeenCalledTimes(1); // rename + cascade in one txn
    expect(commitUndoTxn).toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });
});

describe("anim.service generic property tab", () => {
  it("getAnimElementGenericProps parses the AnimObj getPropsJSON into entries", () => {
    const propsJSON = JSON.stringify([
      { name: "name", type: "string", value: "Spin0", readonly: false, hasdefault: false },
      { name: "angle", type: "real", value: 90, readonly: false, hasdefault: true, isdefault: false },
    ]);
    const obj = { uid: 5, getPropsJSON: () => propsJSON } as unknown as Record<string, unknown>;
    const { ctx } = makeCtx({ objs: [obj] });
    const res = services.getAnimElementGenericProps(ctx, { sceneId: 1, uid: 5 });
    expect(res.ok).toBe(true);
    expect(res.entries.map((e) => e.key)).toEqual(["name", "angle"]);
    expect(res.entries[1]).toMatchObject({ key: "angle", type: "real", value: 90 });
  });

  it("getAnimElementGenericProps returns gone:true for a vanished uid", () => {
    const obj = { uid: 5, getPropsJSON: () => "[]" } as unknown as Record<string, unknown>;
    const { ctx } = makeCtx({ objs: [obj] });
    expect(services.getAnimElementGenericProps(ctx, { sceneId: 1, uid: 999 })).toMatchObject({
      ok: false,
      gone: true,
    });
  });

  it("setAnimElementGenericProp writes via setProp inside an undo txn", () => {
    const setProp = vi.fn();
    const obj = { uid: 5, setProp, resetProp: vi.fn(), getPropsJSON: () => "[]" } as unknown as Record<string, unknown>;
    const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({ objs: [obj] });
    const res = services.setAnimElementGenericProp(ctx, {
      sceneId: 1,
      uid: 5,
      propName: "angle",
      op: "set",
      valueType: "real",
      value: 45,
    });
    expect(startUndoTxn).toHaveBeenCalledWith("Change property: angle");
    expect(setProp).toHaveBeenCalledWith("angle", 45);
    expect(commitUndoTxn).toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it("setAnimElementGenericProp op:reset calls resetProp", () => {
    const resetProp = vi.fn();
    const obj = { uid: 5, setProp: vi.fn(), resetProp, getPropsJSON: () => "[]" } as unknown as Record<string, unknown>;
    const { ctx } = makeCtx({ objs: [obj] });
    services.setAnimElementGenericProp(ctx, { sceneId: 1, uid: 5, propName: "angle", op: "reset", valueType: "" });
    expect(resetProp).toHaveBeenCalledWith("angle");
  });

  it("resetAnimElementGenericProps resets every key in one txn", () => {
    const resetProp = vi.fn();
    const obj = { uid: 5, setProp: vi.fn(), resetProp, getPropsJSON: () => "[]" } as unknown as Record<string, unknown>;
    const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({ objs: [obj] });
    services.resetAnimElementGenericProps(ctx, { sceneId: 1, uid: 5, propNames: ["angle", "axis"] });
    expect(startUndoTxn).toHaveBeenCalledWith("Reset 2 properties");
    expect(resetProp).toHaveBeenCalledWith("angle");
    expect(resetProp).toHaveBeenCalledWith("axis");
    expect(commitUndoTxn).toHaveBeenCalled();
  });
});

describe("anim.service getAnimTargetOptions", () => {
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

describe("anim.service setAnimElementProp realtime timing", () => {
  // An AnimObj whose start / end setters log, so the order of a restore, the
  // transaction, and the write can be pinned.
  function spiedObj(uid: number, log: string[]) {
    const o = makeObj({ uid, name: "A", className: "SimpleSpin" });
    let start = o.start;
    let end = o.end;
    Object.defineProperty(o, "start", {
      get: () => start,
      set: (v: { millisec: number }) => {
        start = v;
        log.push(`start=${v.millisec}`);
      },
    });
    Object.defineProperty(o, "end", {
      get: () => end,
      set: (v: { millisec: number }) => {
        end = v;
        log.push(`end=${v.millisec}`);
      },
    });
    return o;
  }

  function loggedCtx(log: string[], opts: { resolveThrows?: boolean } = {}) {
    const h = makeCtx({ objs: [spiedObj(5, log)], ...opts });
    h.startUndoTxn.mockImplementation(() => {
      log.push("startTxn");
    });
    h.commitUndoTxn.mockImplementation(() => {
      log.push("commitTxn");
    });
    return h;
  }

  it("preview writes the times without a transaction and returns no detail", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn, resolveRelTime } = loggedCtx(log);
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "timing", value: { startMs: 300, endMs: 1300 }, mode: "preview",
    });
    expect(res).toEqual({ ok: true });
    expect(log).toEqual(["start=300", "end=1300"]);
    expect(startUndoTxn).not.toHaveBeenCalled();
    expect(resolveRelTime).toHaveBeenCalled();
  });

  it("commit with original restores it outside the transaction, then writes inside it", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "timing", value: { startMs: 900, endMs: 1900 },
      mode: "commit", original: { startMs: 0, endMs: 1000 },
    });
    expect(log).toEqual(["start=0", "end=1000", "startTxn", "start=900", "end=1900", "commitTxn"]);
    expect(startUndoTxn).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.detail).toBeDefined();
  });

  it("commit back to the original only restores: no empty transaction, so redo survives", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "timing", value: { startMs: 0, endMs: 1000 },
      mode: "commit", original: { startMs: 0, endMs: 1000 },
    });
    expect(log).toEqual(["start=0", "end=1000"]);
    expect(startUndoTxn).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.detail).toBeDefined();
  });

  it("abort restores the original without a transaction", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "timing", value: { startMs: 900, endMs: 1900 },
      mode: "abort", original: { startMs: 0, endMs: 1000 },
    });
    expect(log).toEqual(["start=0", "end=1000"]);
    expect(startUndoTxn).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.detail).toBeDefined();
  });

  it("abort without an original writes nothing", () => {
    const log: string[] = [];
    const { ctx } = loggedCtx(log);
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "timing", value: { startMs: 900, endMs: 1900 }, mode: "abort",
    });
    expect(res).toEqual({ ok: false });
    expect(log).toEqual([]);
  });

  it("preview / abort are accepted for timing only", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "SimpleSpin", props: { angle: 10 } })];
    const { ctx, startUndoTxn } = makeCtx({ objs });
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "angle", value: 45, mode: "preview",
    });
    expect(res).toEqual({ ok: false });
    expect(objs[0].angle).toBe(10);
    expect(startUndoTxn).not.toHaveBeenCalled();
  });

  it("a vanished uid opens no transaction (an empty commit would clear redo)", () => {
    const objs = [makeObj({ uid: 5, name: "A", className: "SimpleSpin" })];
    const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({ objs });
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 999, prop: "timing", value: { startMs: 0, endMs: 1 },
    });
    expect(res).toEqual({ ok: false, gone: true });
    expect(startUndoTxn).not.toHaveBeenCalled();
    expect(commitUndoTxn).not.toHaveBeenCalled();
  });

  it("a resolveRelTime throw during a preview is swallowed", () => {
    const log: string[] = [];
    const { ctx } = loggedCtx(log, { resolveThrows: true });
    const res = services.setAnimElementProp(ctx, {
      sceneId: 1, uid: 5, prop: "timing", value: { startMs: 300, endMs: 1300 }, mode: "preview",
    });
    expect(res).toEqual({ ok: true });
    expect(log).toEqual(["start=300", "end=1300"]);
  });
});

describe("anim.service setAnimElementGenericProp realtime", () => {
  function genericObj(uid: number, log: string[]) {
    return {
      uid,
      setProp: vi.fn((k: string, v: unknown) => {
        log.push(`set ${k}=${String(v)}`);
      }),
      resetProp: vi.fn((k: string) => {
        log.push(`reset ${k}`);
      }),
      getPropsJSON: () => "[]",
    } as unknown as Record<string, unknown>;
  }

  function loggedCtx(log: string[]) {
    const h = makeCtx({ objs: [genericObj(5, log)] });
    h.startUndoTxn.mockImplementation(() => {
      log.push("startTxn");
    });
    h.commitUndoTxn.mockImplementation(() => {
      log.push("commitTxn");
    });
    return h;
  }

  const base = { sceneId: 1, uid: 5, propName: "angle", op: "set" as const, valueType: "real" };

  it("preview writes via setProp without a transaction and returns no entries", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    const res = services.setAnimElementGenericProp(ctx, { ...base, value: 45, mode: "preview" });
    expect(res).toEqual({ ok: true, entries: [] });
    expect(log).toEqual(["set angle=45"]);
    expect(startUndoTxn).not.toHaveBeenCalled();
  });

  it("commit with originalValue restores it first, then writes in one transaction", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    const res = services.setAnimElementGenericProp(ctx, {
      ...base, value: 45, mode: "commit", originalValue: 10,
    });
    expect(log).toEqual(["set angle=10", "startTxn", "set angle=45", "commitTxn"]);
    expect(startUndoTxn).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  it("commit from a default prop restores via resetProp so undo reverts the default flag", () => {
    const log: string[] = [];
    const { ctx } = loggedCtx(log);
    services.setAnimElementGenericProp(ctx, {
      ...base, value: 45, mode: "commit", originalValue: 10, originalWasDefault: true,
    });
    expect(log).toEqual(["reset angle", "startTxn", "set angle=45", "commitTxn"]);
  });

  it("abort restores the value it carries, or the default flag, without a transaction", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    expect(services.setAnimElementGenericProp(ctx, { ...base, value: 10, mode: "abort" }))
      .toEqual({ ok: true, entries: [] });
    services.setAnimElementGenericProp(ctx, { ...base, value: 10, mode: "abort", originalWasDefault: true });
    expect(log).toEqual(["set angle=10", "reset angle"]);
    expect(startUndoTxn).not.toHaveBeenCalled();
  });

  it("a reset never previews", () => {
    const log: string[] = [];
    const { ctx } = loggedCtx(log);
    const res = services.setAnimElementGenericProp(ctx, { ...base, op: "reset", mode: "preview" });
    expect(res.ok).toBe(false);
    expect(log).toEqual([]);
  });

  it("a vanished uid opens no transaction", () => {
    const log: string[] = [];
    const { ctx, startUndoTxn } = loggedCtx(log);
    const res = services.setAnimElementGenericProp(ctx, { ...base, uid: 999, value: 45 });
    expect(res).toEqual({ ok: false, gone: true, entries: [] });
    expect(startUndoTxn).not.toHaveBeenCalled();
  });
});
