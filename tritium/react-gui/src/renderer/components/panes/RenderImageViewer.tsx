/**
 * @file components/panes/RenderImageViewer.tsx
 * @description Zoomable / pannable image viewer for the Render Result tab.
 *
 * The image is laid out at `width x height x scale` inside a scrollable
 * container; panning is drag-to-scroll, and a two-finger swipe pans it as
 * ordinary scrolling. Zoom is the toolbar buttons plus a trackpad pinch --
 * which every browser encodes as a wheel event with a synthetic `ctrlKey`, the
 * only way to read a pinch on an element -- anchored at the pointer so the
 * spot under the cursor stays put. Fit-to-view and 100% are explicit
 * actions. The initial fit is applied in a layout effect -- before the browser
 * paints -- so switching to the tab never flashes the image at 100% before it
 * shrinks to fit. The fit needs only the container size and the image
 * dimensions (props), so it does not wait for the <img> to load.
 *
 * The viewer owns the single toolbar for the Render Result tab: the parent's
 * result actions are passed in via `actions` and rendered alongside the zoom
 * controls, and the info text (scene name / size / zoom) sits at the end. This
 * keeps the tab to one toolbar row rather than stacking a separate action bar.
 */

import React, { useRef, useState, useCallback, useLayoutEffect } from "react";
import { useWheel } from "@use-gesture/react";
import { Button, ButtonGroup } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import { Tooltip } from "../../h3-kit/Tooltip";

interface RenderImageViewerProps {
  /** Image data URL. */
  src: string;
  /** Logical image width in pixels. */
  imgWidth: number;
  /** Logical image height in pixels. */
  imgHeight: number;
  /** Source scene name, shown in the toolbar info text. */
  name: string;
  /** Result action buttons, rendered at the start of the single toolbar. */
  actions?: React.ReactNode;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

/**
 * Wheel delta -> zoom factor, as `exp(-delta * RATE)`: exponential so a pinch
 * feels the same at every zoom level, and smooth enough that a trackpad's
 * stream of small deltas does not step visibly. A mouse wheel notch (~100px)
 * lands near the 0.8 the toolbar button applies.
 */
const ZOOM_RATE = 0.002;

/** Rough px-per-line, for the wheels that report deltas in lines. */
const LINE_HEIGHT_PX = 16;
const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const RenderImageViewer: React.FC<RenderImageViewerProps> = ({
  src,
  imgWidth,
  imgHeight,
  name,
  actions,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const fittedRef = useRef(false);

  /**
   * Scale that fits the whole image within the viewport, or null when the
   * container is not measurable yet (zero-sized). Uses only the container size
   * and the known image dimensions, so it does not need a loaded <img>.
   */
  const computeFit = useCallback((): number | null => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0 || el.clientHeight <= 0 || imgWidth <= 0 || imgHeight <= 0) {
      return null;
    }
    return clamp(
      Math.min(el.clientWidth / imgWidth, el.clientHeight / imgHeight),
      MIN_SCALE,
      MAX_SCALE,
    );
  }, [imgWidth, imgHeight]);

  // Fit before the browser paints, so switching to this tab never flashes the
  // image at 100% before it shrinks to fit.
  useLayoutEffect(() => {
    if (fittedRef.current) return;
    const f = computeFit();
    if (f !== null) {
      fittedRef.current = true;
      setScale(f);
    }
  }, [computeFit]);

  const fit = useCallback(() => {
    const f = computeFit();
    if (f !== null) setScale(f);
  }, [computeFit]);
  const zoom = useCallback(
    (factor: number) => setScale((s) => clamp(s * factor, MIN_SCALE, MAX_SCALE)),
    [],
  );

  // --- Pointer-anchored zoom (trackpad pinch / ctrl+wheel) ---
  //
  // The scroll offset that keeps the pointed-at spot in place can only be set
  // once the stage has been re-laid out at the new scale, so the wheel handler
  // records what to line up and a layout effect applies it after the resize.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const stageRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{
    /** Image-space point under the pointer. */
    cx: number;
    cy: number;
    /** Where that point sat in the viewport. */
    px: number;
    py: number;
  } | null>(null);

  const zoomAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const el = scrollRef.current;
      const stage = stageRef.current;
      if (!el || !stage) return;
      const current = scaleRef.current;
      const next = clamp(current * factor, MIN_SCALE, MAX_SCALE);
      if (next === current) return;
      const rect = el.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      anchorRef.current = {
        cx: (clientX - stageRect.left) / current,
        cy: (clientY - stageRect.top) / current,
        px: clientX - rect.left,
        py: clientY - rect.top,
      };
      setScale(next);
    },
    [],
  );

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const el = scrollRef.current;
    const stage = stageRef.current;
    if (!anchor || !el || !stage) return;
    anchorRef.current = null;
    // offsetLeft/Top carry the centring margin the stage gets while it is
    // smaller than the viewport, which the image-space point knows nothing of.
    el.scrollLeft = anchor.cx * scale + stage.offsetLeft - anchor.px;
    el.scrollTop = anchor.cy * scale + stage.offsetTop - anchor.py;
  }, [scale]);

  // Registered on the element with passive:false, because React's own onWheel
  // is passive at the root and could not suppress the browser's page zoom.
  // A plain wheel is left alone: that is the two-finger swipe, and letting it
  // scroll natively is what pans the image.
  useWheel(
    ({ event }) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta =
        event.deltaMode === 1 ? event.deltaY * LINE_HEIGHT_PX : event.deltaY;
      zoomAt(Math.exp(-delta * ZOOM_RATE), event.clientX, event.clientY);
    },
    { target: scrollRef, eventOptions: { passive: false } },
  );

  // Fallback fit: only needed if the layout effect ran before the container was
  // measurable (e.g. the split-pane had not settled its size yet).
  const handleImgLoad = useCallback(() => {
    if (fittedRef.current) return;
    const f = computeFit();
    if (f !== null) {
      fittedRef.current = true;
      setScale(f);
    }
  }, [computeFit]);

  // Drag-to-pan via scroll offset.
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(
    null,
  );
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    const d = dragRef.current;
    if (!el || !d) return;
    el.scrollLeft = d.sl - (e.clientX - d.x);
    el.scrollTop = d.st - (e.clientY - d.y);
  }, []);
  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="riv">
      <div className="riv-toolbar">
        {actions}
        <ButtonGroup>
          <Tooltip content="Zoom out">
            <Button small icon={<AppIcon name="ui.zoomOut" aria-hidden />} aria-label="Zoom out" onClick={() => zoom(0.8)} />
          </Tooltip>
          <Tooltip content="Zoom in">
            <Button small icon={<AppIcon name="ui.zoomIn" aria-hidden />} aria-label="Zoom in" onClick={() => zoom(1.25)} />
          </Tooltip>
        </ButtonGroup>
        <Tooltip content="Fit to window">
          <Button small icon={<AppIcon name="ui.zoomToFit" aria-hidden />} text="Fit" onClick={fit} />
        </Tooltip>
        <Tooltip content="Actual size (100%)">
          <Button small text="100%" onClick={() => setScale(1)} />
        </Tooltip>
        <span className="riv-info">
          {name} · {imgWidth}×{imgHeight} · {Math.round(scale * 100)}%
        </span>
      </div>
      <div
        className="riv-scroll"
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <div
          className="riv-stage"
          ref={stageRef}
          style={{ width: imgWidth * scale, height: imgHeight * scale }}
        >
          <img
            className="riv-img"
            src={src}
            alt="Render result"
            draggable={false}
            onLoad={handleImgLoad}
          />
        </div>
      </div>
    </div>
  );
};
