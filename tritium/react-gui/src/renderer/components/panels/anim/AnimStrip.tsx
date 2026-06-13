/**
 * @file components/panels/anim/AnimStrip.tsx
 * @description One timeline strip = one CueMol `AnimObj`.
 *
 * Drawn from the element's resolved `absStart`..`absEnd` span; the bar width is
 * the element's duration. Colour and leading icon encode the subtype. This
 * phase is display + click-to-select only; drag/resize land in a later phase.
 */

import React from "react";
import { AppIcon } from "../../AppIcon";
import type { AnimElement } from "../../../types";
import { msToPx } from "./timelineGeometry";
import { typeIcon } from "./animElementMeta";

interface AnimStripProps {
  el: AnimElement;
  pxPerMs: number;
  selected: boolean;
  onSelect: (uid: number) => void;
}

/** Minimum visible strip width so a zero/near-zero-duration element is clickable. */
const MIN_STRIP_PX = 3;

/**
 * Render a single animation element as a positioned strip bar.
 *
 * @param el - The element to draw.
 * @param pxPerMs - Current horizontal scale.
 * @param selected - Whether this element is selected.
 * @param onSelect - Called with the element uid on click.
 */
export const AnimStrip: React.FC<AnimStripProps> = ({
  el,
  pxPerMs,
  selected,
  onSelect,
}) => {
  const left = msToPx(el.absStartMs, pxPerMs);
  const width = Math.max(MIN_STRIP_PX, msToPx(el.absEndMs - el.absStartMs, pxPerMs));
  const className =
    `anim-strip anim-strip--${el.type}` +
    (selected ? " is-selected" : "") +
    (el.disabled ? " is-disabled" : "");

  return (
    <div
      className={className}
      style={{ left, width }}
      data-uid={el.uid}
      data-type={el.type}
      title={`${el.name} (${el.type})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(el.uid);
      }}
    >
      <AppIcon name={typeIcon(el.type)} size="sm" className="anim-strip-icon" aria-hidden />
      <span className="anim-strip-label">{el.name}</span>
    </div>
  );
};
