/**
 * @file features/render/RenderImageViewer.tsx
 * @description Zoomable / pannable image viewer for the rendering window.
 *
 * The image is laid out at `width x height x scale` inside a scrollable
 * container; panning is drag-to-scroll, and a two-finger swipe pans it as
 * ordinary scrolling. Zoom is the toolbar buttons plus a trackpad pinch --
 * which every browser encodes as a wheel event with a synthetic `ctrlKey`, the
 * only way to read a pinch on an element. A pinch (and cmd/ctrl + wheel) is
 * anchored at the pointer, so the spot under the cursor stays put; the toolbar
 * buttons are anchored at the centre of the viewport, which is what the user
 * is looking at when reaching for them.
 *
 * A new image keeps the framing instead of re-fitting. A render is usually the
 * same scene again with one setting changed, so re-fitting made the user zoom
 * back in on every iteration of the loop the render history exists for. When
 * the new image has a different pixel size, the zoom is rescaled by the ratio
 * of the two fit scales and the viewport is re-centred on the same relative
 * point, so the same part of the picture stays on screen. Fit-to-view and 100%
 * are explicit actions.
 *
 * The initial fit is applied in a layout effect -- before the browser paints --
 * so opening the window never flashes the image at 100% before it shrinks to
 * fit. The fit needs only the container size and the image dimensions (props),
 * so it does not wait for the <img> to load.
 *
 * The viewer owns the single toolbar for the image area: the parent's result
 * actions are passed in via `actions` and rendered alongside the zoom controls,
 * and the info text (scene name / size / zoom) sits at the end. This keeps the
 * pane to one toolbar row rather than stacking a separate action bar.
 */

import React, { useRef, useState, useCallback, useLayoutEffect } from "react";
import { useWheel } from "@use-gesture/react";
import { Button, ButtonGroup } from "@blueprintjs/core";
import { AppIcon, Tooltip } from "@renderer/h3-kit/primitives";

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
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  /** Whether an initial fit has been applied (it needs a measurable container). */
  const fittedRef = useRef(false);
  /** Image size the current framing was computed for. */
  const sizeRef = useRef({ w: imgWidth, h: imgHeight });

  /**
   * Scale that fits a `w x h` image within the viewport, or null when the
   * container is not measurable yet (zero-sized). Uses only the container size
   * and the given dimensions, so it does not need a loaded <img>.
   */
  const fitFor = useCallback((w: number, h: number): number | null => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0 || el.clientHeight <= 0 || w <= 0 || h <= 0) {
      return null;
    }
    return clamp(Math.min(el.clientWidth / w, el.clientHeight / h), MIN_SCALE, MAX_SCALE);
  }, []);
  const computeFit = useCallback(
    (): number | null => fitFor(imgWidth, imgHeight),
    [fitFor, imgWidth, imgHeight],
  );

  // --- Anchored zoom ---
  //
  // The scroll offset that keeps the anchored spot in place can only be set
  // once the stage has been re-laid out at the new scale, so the caller records
  // what to line up and a layout effect applies it after the resize.
  const anchorRef = useRef<{
    /** Image-space point to pin. */
    cx: number;
    cy: number;
    /** Where that point should sit in the viewport. */
    px: number;
    py: number;
  } | null>(null);

  /**
   * Viewport centre in normalized image coordinates (0..1), kept current as the
   * container scrolls. It has to be tracked rather than computed on demand: by
   * the time a new image size is in the DOM the old scroll offset is already
   * gone, clamped to the new content size.
   */
  const centerRef = useRef({ nx: 0.5, ny: 0.5 });
  const updateCenter = useCallback(() => {
    const el = scrollRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;
    const s = scaleRef.current;
    if (s <= 0 || imgWidth <= 0 || imgHeight <= 0) return;
    const elRect = el.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    centerRef.current = {
      nx: clamp(
        (elRect.left + el.clientWidth / 2 - stageRect.left) / (imgWidth * s),
        0,
        1,
      ),
      ny: clamp(
        (elRect.top + el.clientHeight / 2 - stageRect.top) / (imgHeight * s),
        0,
        1,
      ),
    };
  }, [imgWidth, imgHeight]);

  /**
   * Scroll the pending anchor's image point back to the viewport spot it was
   * pinned to. Must run against the layout the given scale produced.
   */
  const applyAnchor = useCallback(
    (scaleNow: number) => {
      const anchor = anchorRef.current;
      const el = scrollRef.current;
      const stage = stageRef.current;
      if (!anchor || !el || !stage) return;
      anchorRef.current = null;
      // Measured, not derived from offsetLeft/offsetTop: .riv-scroll is not a
      // positioned element, so those are relative to the nearest positioned
      // ancestor (the Allotment pane) and carry the toolbar's height in the
      // vertical direction -- which used to send every zoom to the bottom of
      // the image. Both rects are read before either write, since scrolling
      // the container moves the stage.
      const elRect = el.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      el.scrollLeft += stageRect.left + anchor.cx * scaleNow - elRect.left - anchor.px;
      el.scrollTop += stageRect.top + anchor.cy * scaleNow - elRect.top - anchor.py;
      // A zoom can change the visible region without moving the scroll offset
      // (the stage grows around a pinned edge), so no scroll event would fire.
      updateCenter();
    },
    [updateCenter],
  );

  // Declared before the effects that set an anchor, so that within a commit the
  // anchor is always applied against the layout its scale was chosen for.
  useLayoutEffect(() => {
    applyAnchor(scale);
  }, [scale, imgWidth, imgHeight, applyAnchor]);

  // Fit before the browser paints, so opening the window never flashes the
  // image at 100% before it shrinks to fit. Only the first image is fitted;
  // later ones keep the framing (below).
  useLayoutEffect(() => {
    if (fittedRef.current) return;
    const f = computeFit();
    if (f !== null) {
      fittedRef.current = true;
      setScale(f);
    }
  }, [computeFit]);

  // Keep the framing when the image is replaced by one of a different size:
  // rescale by the ratio of the two fit scales and re-centre on the same
  // relative point, so the same part of the picture stays on screen. An image
  // of the SAME size needs nothing -- the stage keeps its layout, so the
  // browser keeps the scroll offset.
  useLayoutEffect(() => {
    const prev = sizeRef.current;
    if (prev.w === imgWidth && prev.h === imgHeight) return;
    sizeRef.current = { w: imgWidth, h: imgHeight };
    // The first image belongs to the fit effect above.
    if (!fittedRef.current) return;
    const el = scrollRef.current;
    const before = fitFor(prev.w, prev.h);
    const after = fitFor(imgWidth, imgHeight);
    if (!el || before === null || after === null) return;
    const { nx, ny } = centerRef.current;
    anchorRef.current = {
      cx: nx * imgWidth,
      cy: ny * imgHeight,
      px: el.clientWidth / 2,
      py: el.clientHeight / 2,
    };
    // Both fits use the current container size, so a container resize cancels
    // out of the ratio and only the image's own change scales the zoom.
    const current = scaleRef.current;
    const next = clamp((current * after) / before, MIN_SCALE, MAX_SCALE);
    // An unchanged scale re-renders nothing, so the anchor would never be
    // applied -- do it here, against the layout that is already final.
    if (next === current) applyAnchor(next);
    else setScale(next);
  }, [imgWidth, imgHeight, fitFor, applyAnchor]);

  /** Zoom to an absolute scale, pinning an image point to a viewport spot. */
  const zoomTo = useCallback(
    (next: number, clientX: number, clientY: number) => {
      const el = scrollRef.current;
      const stage = stageRef.current;
      if (!el || !stage) return;
      const current = scaleRef.current;
      const target = clamp(next, MIN_SCALE, MAX_SCALE);
      if (target === current) return;
      const elRect = el.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      anchorRef.current = {
        cx: (clientX - stageRect.left) / current,
        cy: (clientY - stageRect.top) / current,
        px: clientX - elRect.left,
        py: clientY - elRect.top,
      };
      setScale(target);
    },
    [],
  );

  /** Zoom to an absolute scale about the centre of the viewport. */
  const zoomCentered = useCallback(
    (next: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      zoomTo(next, rect.left + el.clientWidth / 2, rect.top + el.clientHeight / 2);
    },
    [zoomTo],
  );
  /** The toolbar's zoom steps: centred, since that is where the user is looking. */
  const zoomBy = useCallback(
    (factor: number) => zoomCentered(scaleRef.current * factor),
    [zoomCentered],
  );
  const fit = useCallback(() => {
    const f = computeFit();
    if (f !== null) zoomCentered(f);
  }, [computeFit, zoomCentered]);

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
      zoomTo(
        scaleRef.current * Math.exp(-delta * ZOOM_RATE),
        event.clientX,
        event.clientY,
      );
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
            <Button small icon={<AppIcon name="ui.zoomOut" aria-hidden />} aria-label="Zoom out" onClick={() => zoomBy(0.8)} />
          </Tooltip>
          <Tooltip content="Zoom in">
            <Button small icon={<AppIcon name="ui.zoomIn" aria-hidden />} aria-label="Zoom in" onClick={() => zoomBy(1.25)} />
          </Tooltip>
        </ButtonGroup>
        <Tooltip content="Fit to window">
          <Button small icon={<AppIcon name="ui.zoomToFit" aria-hidden />} text="Fit" onClick={fit} />
        </Tooltip>
        <Tooltip content="Actual size (100%)">
          <Button small text="100%" onClick={() => zoomCentered(1)} />
        </Tooltip>
        <span className="riv-info">
          {name} · {imgWidth}×{imgHeight} · {Math.round(scale * 100)}%
        </span>
      </div>
      <div
        className="riv-scroll"
        ref={scrollRef}
        onScroll={updateCenter}
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
