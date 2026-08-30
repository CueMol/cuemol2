/**
 * @file components/panels/anim/AnimTimeRuler.tsx
 * @description Horizontal time ruler for the animation timeline.
 *
 * Draws "nice"-spaced millisecond tick marks with labels. The ruler is sticky
 * (CSS) so it stays pinned to the top while the lanes scroll vertically and
 * moves with the content horizontally.
 */

import React from "react";
import { msToPx, niceTickStepMs, formatTimeLabel } from "./timelineGeometry";

interface AnimTimeRulerProps {
  /** Total time extent to cover (ms). */
  contentMs: number;
  /** Current horizontal scale. */
  pxPerMs: number;
  /** Canvas width (px) -- ticks past this are not drawn. */
  widthPx: number;
  /** Start a playhead scrub (mousedown on the ruler). */
  onMouseDown?: (e: React.MouseEvent) => void;
}

/**
 * Render the time ruler tick marks for the given extent and scale.
 */
export const AnimTimeRuler: React.FC<AnimTimeRulerProps> = ({
  contentMs,
  pxPerMs,
  widthPx,
  onMouseDown,
}) => {
  const step = niceTickStepMs(pxPerMs);
  const ticks: React.ReactNode[] = [];
  for (let t = 0; t <= contentMs; t += step) {
    const left = msToPx(t, pxPerMs);
    if (left > widthPx) break;
    ticks.push(
      <div key={t} className="anim-tick" style={{ left }}>
        <span className="anim-tick-label type-caption">{formatTimeLabel(t, step)}</span>
      </div>,
    );
  }
  return (
    <div className="anim-ruler" onMouseDown={onMouseDown}>
      {ticks}
    </div>
  );
};
