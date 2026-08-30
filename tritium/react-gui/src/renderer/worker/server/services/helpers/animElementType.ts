/**
 * @file worker/server/services/helpers/animElementType.ts
 * @description Derive an `AnimElementType` from a wrapped CueMol `AnimObj`.
 *
 * `AnimObj` exposes no `type` property, so the timeline must infer the
 * concrete subtype. The native class name (`getClassName()`, present on every
 * wrapper via `BaseWrapper`) is the primary source; a distinguishing-property
 * probe is the fallback for the rare case where the wrapped object resolves to
 * a base wrapper without the subtype getters.
 */

import type { AnimElementType } from "@renderer/types";

const KNOWN: readonly string[] = [
  "SimpleSpin",
  "CamMotion",
  "ShowHideAnim",
  "SlideInOutAnim",
  "MolAnim",
  "RealPropAnim",
  "RendXformAnim",
  "NoopAnimObj",
];

/** `key in obj` that never throws for getter-backed wrappers. */
function probe(obj: Record<string, unknown>, key: string): boolean {
  try {
    return key in obj;
  } catch {
    return false;
  }
}

/**
 * Map a wrapped `AnimObj` to its `AnimElementType`.
 *
 * @param obj - The wrapped `AnimObj` (a sync wrapper in the worker thread).
 * @returns The concrete subtype, or `'unknown'` when it cannot be determined.
 */
export function classNameToType(obj: unknown): AnimElementType {
  const w = obj as { getClassName?: () => string } & Record<string, unknown>;

  let cn = "";
  try {
    cn = w.getClassName?.() ?? "";
  } catch {
    cn = "";
  }
  if (KNOWN.includes(cn)) return cn as AnimElementType;

  // Fallback: distinguishing-property probe (order matters -- most specific
  // first). Mirrors the per-type props seen in the UXP property dialog.
  if (probe(w, "angle") && probe(w, "axis")) return "SimpleSpin";
  if (probe(w, "endcam")) return "CamMotion";
  if (probe(w, "fade")) return "ShowHideAnim";
  if (probe(w, "direction") && probe(w, "distance")) return "SlideInOutAnim";
  if (probe(w, "mol")) return "MolAnim";
  if (probe(w, "rend") && probe(w, "startValue")) return "RealPropAnim";
  return "unknown";
}
