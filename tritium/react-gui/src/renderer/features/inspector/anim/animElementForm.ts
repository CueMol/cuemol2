/**
 * @file features/inspector/anim/animElementForm.ts
 * @description The animation element inspector's form shape and the
 * conversions around it.
 *
 * The editor keeps its own `FormState` rather than editing the fetched detail
 * in place, because the fields are text while the element stores numbers: a
 * half-typed value has to survive on screen without being written. These turn
 * one into the other, and none of them needs React.
 */

import type { AnimElementDetail } from '@renderer/worker/server/services/animDetail.service';

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
  startMs: number;
  durationMs: number;
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
    startMs: c.startMs,
    durationMs: c.endMs - c.startMs,
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
