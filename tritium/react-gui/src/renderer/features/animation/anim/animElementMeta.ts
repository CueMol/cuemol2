/**
 * @file features/animation/anim/animElementMeta.ts
 * @description UI metadata (icon) for each animation element subtype.
 */

import type { AnimElementType } from "@renderer/types";
import type { AppIconKey } from "@renderer/h3-kit/primitives";

/** Leading icon per `AnimElementType` (color-blind-safe pairing with color). */
const TYPE_ICON: Record<AnimElementType, AppIconKey> = {
  SimpleSpin: "track.camera",
  CamMotion: "track.camera",
  ShowHideAnim: "ui.eyeOpen",
  SlideInOutAnim: "track.width",
  MolAnim: "track.key",
  RealPropAnim: "track.style",
  RendXformAnim: "track.width",
  NoopAnimObj: "track.key",
  unknown: "track.key",
};

/** Icon key for an element subtype (falls back to a generic key glyph). */
export function typeIcon(type: AnimElementType): AppIconKey {
  return TYPE_ICON[type] ?? "track.key";
}
