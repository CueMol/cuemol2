/**
 * @file components/panes/RenderImageViewer.tsx
 * @description Zoomable / pannable image viewer for the Render Result tab.
 *
 * The image is laid out at `width × height × scale` inside a scrollable
 * container; panning is drag-to-scroll. Fit-to-view and 100% are explicit
 * actions, and the view fits once when the image first loads.
 */

import React, { useRef, useState, useCallback } from "react";
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

  /** Scale that makes the image fit entirely within the viewport. */
  const computeFit = useCallback((): number => {
    const el = scrollRef.current;
    if (!el || imgWidth <= 0 || imgHeight <= 0) return 1;
    return clamp(
      Math.min(el.clientWidth / imgWidth, el.clientHeight / imgHeight),
      MIN_SCALE,
      MAX_SCALE,
    );
  }, [imgWidth, imgHeight]);

  const fit = useCallback(() => setScale(computeFit()), [computeFit]);
  const zoom = useCallback(
    (factor: number) => setScale((s) => clamp(s * factor, MIN_SCALE, MAX_SCALE)),
    [],
  );

  // Fit once, when the image first loads (the tab is visible by then).
  const handleImgLoad = useCallback(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    setScale(computeFit());
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
