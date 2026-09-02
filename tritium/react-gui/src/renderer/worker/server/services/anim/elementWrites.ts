/**
 * @file worker/server/services/anim/elementWrites.ts
 * @description Planning the guarded element writes -- time reference, name,
 * timing -- so that every check, graph walk, rounding and TimeValue
 * allocation happens BEFORE an undo transaction opens, and what runs inside
 * it is wrapper assignments only.
 *
 * The split matters for two reasons. A write that is refused must leave no
 * trace: not the name (the old code wrote a dangling `timeRefName` and then
 * failed to re-base), and not an undo transaction either -- C++ clears the
 * redo stack even for an empty commit. And a write that is accepted must not
 * fail half-way for a reason that could have been known up front.
 *
 * The structured inspector path (`detail.ts`) and the Generic tab
 * (`genericProps.ts`) both go through these plans, so the two surfaces apply
 * one validation table (see `checkTimeRef` / `checkName` in `timeRefGraph.ts`).
 */
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { fail, ok, type Result } from "@renderer/worker/shared/result";
import { checkName, checkTimeRef, type TimeRefGraph } from "./timeRefGraph";
import { isFiniteMs, makeTimeValue } from "./resolve";
import { goneFail, type AnimTimingMs } from "./types";

/** A validated write: `apply` performs the wrapper assignments, nothing else. */
export interface WritePlan {
  apply: () => void;
  /** The value already holds; nothing to write and no transaction to open. */
  noop: boolean;
}

/** `{ startMs, endMs }` with two finite numbers. */
export function isTiming(v: unknown): v is AnimTimingMs {
  return (
    typeof v === "object" &&
    v !== null &&
    isFiniteMs((v as AnimTimingMs).startMs) &&
    isFiniteMs((v as AnimTimingMs).endMs)
  );
}

/**
 * Hold a re-based span at or after its base, keeping its duration.
 *
 * A relative start is an offset from the reference's END, so a negative one
 * would mean "starts before the element it chains after finishes" -- a state
 * the timeline was never designed for (it resolves to an absolute time that can
 * fall before zero). Rather than let a conversion produce one, the element is
 * pulled to the reference's end and keeps its length.
 */
export function clampRelSpan(start: number, end: number): { start: number; end: number } {
  if (start >= 0) return { start, end };
  return { start: 0, end: Math.max(0, end - start) };
}

/**
 * Write a relative span, ordered (start <= end) and rounded. Throws when a
 * TimeValue cannot be created, so a caller inside `undoTxnResult` rolls back.
 */
export function applyTiming(ctx: WorkerContext, obj: AnimObj, v: AnimTimingMs): void {
  const tvS = makeTimeValue(ctx, Math.min(v.startMs, v.endMs));
  const tvE = makeTimeValue(ctx, Math.max(v.startMs, v.endMs));
  if (!tvS || !tvE) throw new Error("TimeValue create failed");
  const w = obj as unknown as Record<string, unknown>;
  w.start = tvS;
  w.end = tvE;
}

/**
 * Plan a `timeRefName` write for the element `uid` (whose wrapper is `obj`).
 *
 * The reference is validated against the current chain (self, cycle,
 * missing, ambiguous, unresolved target). When the element currently
 * resolves, its offsets are re-based so it keeps its absolute position
 * against the new reference's end, floored at that end; when it does not,
 * there is no position to keep and only the name changes.
 */
export function planTimeRefWrite(
  ctx: WorkerContext,
  graph: TimeRefGraph,
  obj: AnimObj,
  uid: number,
  value: unknown,
): Result<WritePlan> {
  const node = graph.byUid.get(uid);
  if (!node) return goneFail();
  const ref = String(value ?? "");
  const check = checkTimeRef(graph, uid, ref);
  if (!check.ok) return check;
  if (ref === node.timeRefName) return ok({ apply: () => undefined, noop: true });

  let tvS = null;
  let tvE = null;
  if (node.state === "ok") {
    const span = clampRelSpan(
      (node.absStartMs as number) - check.baseEndMs,
      (node.absEndMs as number) - check.baseEndMs,
    );
    tvS = makeTimeValue(ctx, span.start);
    tvE = makeTimeValue(ctx, span.end);
    if (!tvS || !tvE) return fail("TimeValue create failed", "native");
  }
  const w = obj as unknown as Record<string, unknown>;
  const start = tvS;
  const end = tvE;
  return ok({
    noop: false,
    // Name first, then start, then end: start <= end holds, so C++ never has
    // to collapse the span between the two time writes.
    apply: () => {
      w.timeRefName = ref;
      if (start && end) {
        w.start = start;
        w.end = end;
      }
    },
  });
}

/**
 * Plan a `name` write for the element `uid`. The name is trimmed and must be
 * non-empty and unique. Elements chained to the old name follow the rename,
 * but only when this element is the one the name binds to (the first
 * carrier): a later duplicate has no dependents of its own.
 */
export function planNameWrite(
  graph: TimeRefGraph,
  objs: readonly AnimObj[],
  obj: AnimObj,
  uid: number,
  value: unknown,
): Result<WritePlan> {
  const node = graph.byUid.get(uid);
  if (!node) return goneFail();
  const check = checkName(graph, uid, value);
  if (!check.ok) return check;
  const name = check.name;
  if (name === node.name) return ok({ apply: () => undefined, noop: true });

  const oldName = node.name;
  const dependents =
    oldName !== "" && graph.firstIndexByName.get(oldName) === node.index
      ? graph.nodes.filter((n) => n.uid !== uid && n.timeRefName === oldName)
      : [];
  const w = obj as unknown as Record<string, unknown>;
  return ok({
    noop: false,
    apply: () => {
      w.name = name;
      for (const d of dependents) {
        (objs[d.index] as unknown as Record<string, unknown>).timeRefName = name;
      }
    },
  });
}
