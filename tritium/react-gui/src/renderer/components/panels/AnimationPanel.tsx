/**
 * @file components/panels/AnimationPanel.tsx
 * @description Blender-style animation timeline panel (strip model).
 *
 * Renders the active scene's `AnimMgr` elements as time-ranged strips: one lane
 * per `AnimObj`, each bar spanning `absStart`..`absEnd` on a shared millisecond
 * time axis (left edge = start, width = duration). The channel list on the left
 * names each element; the scrollable area on the right holds the time ruler,
 * the strip lanes, and the playhead.
 *
 * ## Layout
 *
 * ```
 * +-----------------------------------------------------------------+
 * | [|<][>][#][>|]   0:02.500 / 0:10.000   Elements 3  FPS 30  [Fit -+] |
 * +----------------+------------------------------------------------+
 * |  (channel list)|  0      1.0s     2.0s     3.0s   <- ruler      |
 * |  (cam) Cam0    |  #====== Cam0 ======#                          |
 * |  (spin) Spin1  |              #=== Spin1 ===#                   |
 * +----------------+------------------------------------------------+
 *                  ^ each lane = 1 AnimObj; bar = absStart..absEnd  |
 * ```
 *
 * This phase is read-only: strips, ruler, and a static playhead at the
 * manager's `elapsed` position. Playback transport and strip editing land in
 * later phases.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AppIcon } from "../AppIcon";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import type { AnimMgrState } from "../../types";
import { useAnimTimeline } from "../../hooks/useAnimTimeline";
import { AnimTransport } from "./anim/AnimTransport";
import { AnimTimeRuler } from "./anim/AnimTimeRuler";
import { AnimStrip } from "./anim/AnimStrip";
import { typeIcon } from "./anim/animElementMeta";
import {
  DEFAULT_PX_PER_MS,
  clampPxPerMs,
  msToPx,
  timelineWidthPx,
  fitPxPerMs,
} from "./anim/timelineGeometry";

interface AnimationPanelProps {
  cm: AsyncCueMol | null;
  /** Active scene UID; undefined when no scene is active. */
  activeSceneId: number | undefined;
  /** Active mol-view UID (used by playback / scrub in later phases). */
  activeMolViewId: number | undefined;
}

/** Step factor for the zoom in / out buttons. */
const ZOOM_FACTOR = 1.4;

/** Manager snapshot shown before the first fetch resolves. */
const EMPTY_MGR: AnimMgrState = {
  lengthMs: 0,
  elapsedMs: 0,
  playState: "stop",
  loop: false,
  startcam: "",
};

/**
 * Animation timeline panel. Reads live `AnimMgr` data for the active scene and
 * draws each element as a strip.
 */
export const AnimationPanel: React.FC<AnimationPanelProps> = ({
  cm,
  activeSceneId,
}) => {
  const { timeline } = useAnimTimeline({ cm, sceneId: activeSceneId });
  const [pxPerMs, setPxPerMs] = useState(DEFAULT_PX_PER_MS);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);

  const elements = timeline?.elements ?? [];
  const mgr = timeline?.mgr ?? null;

  // Time-axis extent: the manager length, but never less than the furthest
  // element end (length auto-grows on the C++ side; guard regardless).
  const contentMs = useMemo(() => {
    const maxAbsEnd = elements.reduce((m, e) => Math.max(m, e.absEndMs), 0);
    return Math.max(mgr?.lengthMs ?? 0, maxAbsEnd, 1000);
  }, [elements, mgr]);

  const widthPx = timelineWidthPx(contentMs, pxPerMs);
  const playheadLeft = msToPx(mgr?.elapsedMs ?? 0, pxPerMs);

  const handleZoomIn = useCallback(
    () => setPxPerMs((p) => clampPxPerMs(p * ZOOM_FACTOR)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setPxPerMs((p) => clampPxPerMs(p / ZOOM_FACTOR)),
    [],
  );
  const handleFit = useCallback(() => {
    const avail = timelineScrollRef.current?.clientWidth ?? 0;
    setPxPerMs(fitPxPerMs(contentMs, avail));
  }, [contentMs]);

  /** Mirror vertical scroll onto the (hidden-scroll) channel list. */
  const handleTimelineScroll = useCallback(() => {
    if (timelineScrollRef.current && labelScrollRef.current) {
      labelScrollRef.current.scrollTop = timelineScrollRef.current.scrollTop;
    }
  }, []);

  // --- Empty states ---

  if (!cm || activeSceneId === undefined) {
    return (
      <div className="animation-panel">
        <div className="anim-placeholder">
          <AppIcon name="panel.animation" size={48} className="placeholder-icon" aria-hidden />
          <div>No active scene</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animation-panel">
      <AnimTransport
        mgr={mgr ?? EMPTY_MGR}
        fps={timeline?.fps ?? 30}
        elementCount={elements.length}
        onFit={handleFit}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      {elements.length === 0 ? (
        <div className="anim-placeholder">
          <AppIcon name="panel.animation" size={48} className="placeholder-icon" aria-hidden />
          <div>No animation elements in this scene</div>
        </div>
      ) : (
        <div className="anim-body">
          {/* Channel list (left) */}
          <div className="anim-label-col">
            <div className="anim-ruler-corner" />
            <div className="anim-label-scroll" ref={labelScrollRef}>
              {elements.map((el) => (
                <div
                  key={el.uid}
                  className={`anim-label-row${selectedUid === el.uid ? " is-selected" : ""}`}
                  onClick={() =>
                    setSelectedUid((u) => (u === el.uid ? null : el.uid))
                  }
                  title={`${el.name} (${el.type})`}
                >
                  <AppIcon
                    name={typeIcon(el.type)}
                    size="sm"
                    className="anim-label-icon"
                    aria-hidden
                  />
                  <span className="anim-label-text">{el.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time ruler + strip lanes (scrollable) */}
          <div
            className="anim-timeline"
            ref={timelineScrollRef}
            onScroll={handleTimelineScroll}
          >
            <div className="anim-canvas" style={{ width: widthPx }}>
              <AnimTimeRuler contentMs={contentMs} pxPerMs={pxPerMs} widthPx={widthPx} />
              <div className="anim-lanes">
                {elements.map((el) => (
                  <div
                    key={el.uid}
                    className={`anim-lane${selectedUid === el.uid ? " is-selected" : ""}`}
                    onClick={() => setSelectedUid(null)}
                  >
                    <AnimStrip
                      el={el}
                      pxPerMs={pxPerMs}
                      selected={selectedUid === el.uid}
                      onSelect={setSelectedUid}
                    />
                  </div>
                ))}
              </div>
              <div className="anim-playhead" style={{ left: playheadLeft }} aria-hidden />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
