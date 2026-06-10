/**
 * @file components/AppIcon.tsx
 * @description Single entry point for rendering icons. Resolves a semantic key
 * from {@link APP_ICONS} to either a Phosphor or a Blueprint icon, applying a
 * consistent token-based size and inheriting color via `currentColor` (so
 * dark/light themes work without per-consumer color handling).
 *
 * Consumers pass a stable `name` and a size token instead of a raw px value or
 * a library-specific component, so the icon library used for any given key can
 * change in `appIcons.ts` alone.
 *
 * @module AppIcon
 */

import React from "react";
import { Icon as BpIcon } from "@blueprintjs/core";
import { APP_ICONS, type AppIconKey, type AppIconSpec } from "../data/appIcons";

/**
 * Size tokens, in px. Mirror the `--icon-sm/md/lg` CSS tokens in
 * `styles/_variables.css` -- this is the single source for icon px in JS, so
 * consumers never hard-code a pixel size.
 */
const SIZE_PX = { sm: 12, md: 14, lg: 18 } as const;
type SizeToken = keyof typeof SIZE_PX;

/** Default Phosphor stroke weight (bold reads clearly at small UI sizes). */
const DEFAULT_WEIGHT = "bold" as const;

interface AppIconProps {
  /** Semantic key from {@link APP_ICONS}. */
  name: AppIconKey;
  /** Size token (sm/md/lg) or an explicit px value. Defaults to `md`. */
  size?: SizeToken | number;
  className?: string;
  /** Decorative icons should pass `aria-hidden`; labelled buttons own the label. */
  "aria-hidden"?: boolean;
  title?: string;
}

/**
 * Render the registered icon for `name` at the given size, in the current
 * text color.
 */
export const AppIcon: React.FC<AppIconProps> = ({ name, size = "md", ...rest }) => {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  // Widen to the union so both `lib` branches stay reachable: the registry
  // currently holds only Phosphor entries, so without this CFA would narrow
  // the Blueprint branch to `never`. AppIcon must still support `bp` specs.
  const spec = APP_ICONS[name] as AppIconSpec;
  if (spec.lib === "phosphor") {
    const Comp = spec.Comp;
    return <Comp size={px} weight={spec.weight ?? DEFAULT_WEIGHT} {...rest} />;
  }
  return <BpIcon icon={spec.name} size={px} {...rest} />;
};
