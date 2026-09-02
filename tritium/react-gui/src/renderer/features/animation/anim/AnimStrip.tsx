/**
 * @file features/animation/anim/AnimStrip.tsx
 * @description One timeline strip = one CueMol `AnimObj`.
 *
 * Drawn from the element's resolved `absStart`..`absEnd` span; the bar width is
 * the element's duration. Colour and leading icon encode the subtype. The body
 * drags to move the element in time; the left/right edge grips resize it. The
 * actual drag lifecycle (preview + commit) is owned by the parent panel, which
 * passes a preview span back via `previewAbsStartMs` / `previewAbsEndMs`.
 */

import React from "react";
import { AppIcon } from "@renderer/h3-kit/primitives";
import type { AnimElement } from "@renderer/types";
import { msToPx } from "./timelineGeometry";
import { typeIcon } from "./animElementMeta";

/** Drag interaction kind started on a strip. */
export type AnimStripEditMode = "move" | "resize-left" | "resize-right";

interface AnimStripProps {
  el: AnimElement;
  pxPerMs: number;
  selected: boolean;
  /** Override the abs span while this strip is being dragged (ms). */
  previewAbsStartMs?: number;
  previewAbsEndMs?: number;
  onSelect: (uid: number) => void;
  onEditMouseDown: (
    el: AnimElement,
    mode: AnimStripEditMode,
    e: React.MouseEvent,
  ) => void;
}

/** Minimum visible strip width so a zero/near-zero-duration element is clickable. */
const MIN_STRIP_PX = 3;

/**
 * Render a single animation element as a positioned, draggable strip bar.
 *
 * @param el - The element to draw.
 * @param pxPerMs - Current horizontal scale.
 * @param selected - Whether this element is selected.
 * @param previewAbsStartMs - Drag-preview start override (ms), if dragging.
 * @param previewAbsEndMs - Drag-preview end override (ms), if dragging.
 * @param onSelect - Called with the element uid on click.
 * @param onEditMouseDown - Begins a move / resize drag.
 */
export const AnimStrip: React.FC<AnimStripProps> = ({
  el,
  pxPerMs,
  selected,
  previewAbsStartMs,
  previewAbsEndMs,
  onSelect,
  onEditMouseDown,
}) => {
  // A span that falls before zero or runs backwards (a legacy negative
  // offset, a stale position behind an unresolved chain) is drawn clamped to
  // the axis rather than off-canvas: an invisible strip cannot be selected,
  // and so cannot be repaired.
  const rawStart = previewAbsStartMs ?? el.absStartMs;
  const rawEnd = previewAbsEndMs ?? el.absEndMs;
  const absStart = Math.max(0, rawStart);
  const absEnd = Math.max(absStart, rawEnd);
  const clamped = rawStart < 0 || rawEnd < rawStart;
  const unresolved = el.timeRefState !== "ok";
  const left = msToPx(absStart, pxPerMs);
  const width = Math.max(MIN_STRIP_PX, msToPx(absEnd - absStart, pxPerMs));
  const className =
    `anim-strip anim-strip--${el.type}` +
    (selected ? " is-selected" : "") +
    (el.disabled ? " is-disabled" : "") +
    (unresolved ? " is-unresolved" : "") +
    (clamped ? " is-clamped" : "");
  const title =
    `${el.name} (${el.type})` +
    (el.resolveError ? ` -- ${el.resolveError}` : "") +
    (clamped ? " -- starts before 0:00 (drawn clamped)" : "");

  return (
    <div
      className={className}
      style={{ left, width }}
      data-uid={el.uid}
      data-type={el.type}
      data-ref-state={el.timeRefState}
      title={title}
      onMouseDown={(e) => onEditMouseDown(el, "move", e)}
      onClick={(e) => {
        // Don't let the click bubble to the lane's deselect handler.
        e.stopPropagation();
        onSelect(el.uid);
      }}
    >
      <div
        className="anim-strip-grip anim-strip-grip-left"
        onMouseDown={(e) => {
          e.stopPropagation();
          onEditMouseDown(el, "resize-left", e);
        }}
      />
      <AppIcon name={typeIcon(el.type)} size="sm" className="anim-strip-icon" aria-hidden />
      <span className="anim-strip-label">{el.name}</span>
      <div
        className="anim-strip-grip anim-strip-grip-right"
        onMouseDown={(e) => {
          e.stopPropagation();
          onEditMouseDown(el, "resize-right", e);
        }}
      />
    </div>
  );
};
