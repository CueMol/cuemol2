/**
 * @file components/panes/RenderImageViewer.tsx
 * @description Zoomable / pannable image viewer for the Render Result tab.
 *
 * The image is laid out at `width x height x scale` inside a scrollable
 * container; panning is drag-to-scroll. Fit-to-view and 100% are explicit
 * actions. The initial fit is applied in a layout effect -- before the browser
 * paints -- so switching to the tab never flashes the image at 100% before it
 * shrinks to fit. The fit needs only the container size and the image
 * dimensions (props), so it does not wait for the <img> to load.
 */

import React, { useRef, useState, useCallback, useLayoutEffect } from "react";
import { Button, ButtonGroup } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";

interface RenderImageViewerProps {
  /** Image data URL. */
  src: string;
  /** Logical image width in pixels. */
  imgWidth: number;
  /** Logical image height in pixels. */
  imgHeight: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const RenderImageViewer: React.FC<RenderImageViewerProps> = ({
  src,
  imgWidth,
  imgHeight,
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
        <ButtonGroup>
          <Button small icon={<AppIcon name="ui.zoomOut" aria-hidden />} title="Zoom out" onClick={() => zoom(0.8)} />
          <Button small icon={<AppIcon name="ui.zoomIn" aria-hidden />} title="Zoom in" onClick={() => zoom(1.25)} />
        </ButtonGroup>
        <Button small icon={<AppIcon name="ui.zoomToFit" aria-hidden />} text="Fit" onClick={fit} />
        <Button small text="100%" onClick={() => setScale(1)} />
        <span className="riv-zoom-label">{Math.round(scale * 100)}%</span>
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
