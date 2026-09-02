/**
 * @file features/inspector/anim/animElementForm.ts
 * @description The animation element inspector's form shape and the
 * conversions around it.
 *
 * The editor keeps its own `FormState` rather than editing the fetched detail
 * in place, because the fields are text while the element stores numbers: a
 * half-typed value has to survive on screen without being written. These turn
 * one into the other, and none of them needs React. Start / Duration are not
 * in it: they are realtime drag fields owned by `useAnimTimingDrag`.
 */

import type {
  AnimElementCommon,
  AnimElementDetail,
  AnimElementSibling,
} from '@renderer/worker/server/services/anim/anim.service';
import { formatMs } from '@renderer/h3-kit/form';

export const TYPE_LABEL: Record<string, string> = {
  SimpleSpin: "Simple spin",
  CamMotion: "Camera motion",
  ShowHideAnim: "Show / Hide",
  SlideInOutAnim: "Slide",
  MolAnim: "Mol morphing",
  NoopAnimObj: "No operation",
  unknown: "Animation element",
};

/** Draft of the numeric / text fields (controlled while editing). */
export interface FormState {
  name: string;
  quadricPct: number;
  angle: number;
  tgtAlpha: number;
  direction: number;
  distance: number;
  startValue: number;
  endValue: number;
}

export function detailToForm(d: AnimElementDetail): FormState {
  const c = d.common;
  const t = d.typeProps;
  return {
    name: c.name,
    quadricPct: c.quadric * 100,
    angle: t.angle ?? 0,
    tgtAlpha: t.tgtAlpha ?? 1,
    direction: t.direction ?? 0,
    distance: t.distance ?? 1,
    startValue: t.startValue ?? 0,
    endValue: t.endValue ?? 1,
  };
}

/** Normalize an angle into [0, 360] by wrapping (UXP parity, not clamping). */
export function wrapAngle(a: number): number {
  let v = a;
  while (v < 0) v += 360;
  while (v > 360) v -= 360;
  return v;
}

/** Which axis preset (if any) the current vector matches. */
export function axisPreset(x: number, y: number, z: number): string {
  if (x === 1 && y === 0 && z === 0) return "x";
  if (x === 0 && y === 1 && z === 0) return "y";
  if (x === 0 && y === 0 && z === 1) return "z";
  return "cart";
}

/** Compact axis-component display: round to 4 dp and drop trailing zeros. */
export function fmtAxis(n: number): string {
  return String(Math.round(n * 1e4) / 1e4);
}

/** One `<option>` of the Relative-to select. */
export interface TimeRefOption {
  key: string;
  value: string;
  label: string;
  disabled: boolean;
}

/**
 * The Relative-to options for an element: every candidate the worker listed,
 * the unusable ones disabled with the reason in their label rather than
 * hidden (a shorter list would look like the element is missing), plus --
 * when the element's current reference names nothing -- a selected, disabled
 * `(missing: NAME)` entry so the select tells the truth instead of falling
 * back to "(absolute)". Duplicates and empty names are dropped defensively.
 */
export function buildTimeRefOptions(
  common: Pick<AnimElementCommon, "timeRefName">,
  siblings: readonly AnimElementSibling[],
): { options: TimeRefOption[]; dangling: string | null } {
  const options: TimeRefOption[] = [];
  const seen = new Set<string>();
  siblings.forEach((s, i) => {
    if (s.name === "" || seen.has(s.name)) return;
    seen.add(s.name);
    options.push({
      key: `${s.name}#${i}`,
      value: s.name,
      label: s.usable ? s.name : `${s.name} (${s.reason ?? "unavailable"})`,
      disabled: !s.usable,
    });
  });
  const current = common.timeRefName;
  const dangling = current !== "" && !seen.has(current) ? current : null;
  if (dangling !== null) {
    options.unshift({
      key: `${dangling}#missing`,
      value: dangling,
      label: `(missing: ${dangling})`,
      disabled: true,
    });
  }
  return { options, dangling };
}

/**
 * The note under the Start field for a legacy negative offset. The field
 * shows such a start as 0:00.000 (the display floors at zero, and a leading
 * minus is the relative-entry sign), so the stored value is stated here.
 */
export function legacyStartNote(startMs: number): string | null {
  if (startMs >= 0) return null;
  return `Stored start is -${formatMs(-startMs)} (legacy negative offset); it is kept until you set a new start.`;
}
