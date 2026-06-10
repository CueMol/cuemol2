/**
 * @file data/appIcons.ts
 * @description Central registry mapping semantic icon keys to a concrete icon
 * renderer. This is the single place that decides whether an icon comes from
 * Phosphor (`@phosphor-icons/react`) or Blueprint (`@blueprintjs/icons`), so
 * the rest of the app references stable keys via {@link AppIcon} and the
 * library choice can change here without touching consumers.
 *
 * Migration policy: prefer Phosphor for hand-picked / domain-specific icons
 * (molecular tools etc.); keep Blueprint entries for icons that already fit.
 *
 * @module data/appIcons
 */

import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import {
  Angle,
  ArrowsClockwise,
  ArrowsOutCardinal,
  Lasso,
  Ruler,
  Selection,
} from "@phosphor-icons/react";
import type { IconName } from "@blueprintjs/icons";

/** A registry entry: either a Phosphor component or a Blueprint icon name. */
export type AppIconSpec =
  | { lib: "phosphor"; Comp: PhosphorIcon; weight?: IconWeight }
  | { lib: "bp"; name: IconName };

/**
 * Semantic icon registry. Keys are namespaced by area (e.g. `tool.*`).
 * Add an entry here, then reference it via `<AppIcon name="..." />`.
 */
export const APP_ICONS = {
  // Viewport tools (pilot migration to Phosphor).
  "tool.navigate": { lib: "phosphor", Comp: ArrowsOutCardinal },
  "tool.rectSelect": { lib: "phosphor", Comp: Selection },
  "tool.lasso": { lib: "phosphor", Comp: Lasso },
  "tool.distance": { lib: "phosphor", Comp: Ruler },
  "tool.angle": { lib: "phosphor", Comp: Angle },
  "tool.torsion": { lib: "phosphor", Comp: ArrowsClockwise },
} as const satisfies Record<string, AppIconSpec>;

export type AppIconKey = keyof typeof APP_ICONS;
