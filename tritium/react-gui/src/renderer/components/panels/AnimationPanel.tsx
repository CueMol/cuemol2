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
 * | [|<][>/||][#][>|]  0:02.500 / 0:10.000  Loop[x] Elements 3 FPS 30 [Fit -+] |
 * +----------------+------------------------------------------------+
 * |  (channel list)|  0      1.0s     2.0s     3.0s   <- ruler/scrub |
 * |  (cam) Cam0    |  #====== Cam0 ======#                          |
 * |  (spin) Spin1  |              #=== Spin1 ===#                   |
 * +----------------+------------------------------------------------+
 *                  ^ each lane = 1 AnimObj; bar = absStart..absEnd  |
 * ```
 *
 * Playback is driven in C++ (`AnimMgr.start(view)` + the worker's redraw loop);
 * the renderer issues transport ops and polls `elapsed` while playing (see
 * `useAnimTransport`). Clicking / dragging the ruler scrubs the playhead and
 * commits a single seek on release. Strip editing lands in a later phase.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AppIcon } from "../AppIcon";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import { useAnimTimeline } from "../../hooks/useAnimTimeline";
import { useAnimTransport } from "../../hooks/useAnimTransport";
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
  /** Active mol-view UID; required for playback / scrub (transport disabled without it). */
  activeMolViewId: number | undefined;
}

/** Step factor for the zoom in / out buttons. */
const ZOOM_FACTOR = 1.4;

/**
 * Animation timeline panel. Reads live `AnimMgr` data for the active scene,
 * draws each element as a strip, and drives playback / scrub via the C++
 * animation manager.
 */
export const AnimationPanel: React.FC<AnimationPanelProps> = ({
  cm,
  activeSceneId,
  activeMolViewId,
}) => {
  const { timeline } = useAnimTimeline({ cm, sceneId: activeSceneId });
  const transport = useAnimTransport({
    cm,
    sceneId: activeSceneId,
    viewId: activeMolViewId,
    baseMgr: timeline?.mgr ?? null,
  });

  const [pxPerMs, setPxPerMs] = useState(DEFAULT_PX_PER_MS);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  // Non-null only while scrubbing -- shows the playhead at the drag position
  // without committing a seek until release.
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);

  const elements = timeline?.elements ?? [];
  const tmgr = transport.mgr;
  const lengthMs = tmgr.lengthMs;

  // Time-axis extent: the manager length, but never less than the furthest
  // element end (length auto-grows on the C++ side; guard regardless).
  const contentMs = useMemo(() => {
    const maxAbsEnd = elements.reduce((m, e) => Math.max(m, e.absEndMs), 0);
    return Math.max(lengthMs, maxAbsEnd, 1000);
  }, [elements, lengthMs]);

  const widthPx = timelineWidthPx(contentMs, pxPerMs);
  const playheadMs = scrubMs ?? tmgr.elapsedMs;
  const playheadLeft = msToPx(playheadMs, pxPerMs);

  const { seek, canControl } = transport;

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

  /**
   * Begin a playhead scrub on the ruler. Tracks the position locally during
   * the drag (no service calls) and commits a single seek on mouse-up. A bare
   * click (no movement) also commits one seek at the click position.
   */
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || !canControl) return;
      e.preventDefault();
      const toMs = (clientX: number): number => {
        const sc = timelineScrollRef.current;
        if (!sc) return 0;
        const rect = sc.getBoundingClientRect();
        const x = clientX - rect.left + sc.scrollLeft;
        return Math.max(0, Math.min(contentMs, x / pxPerMs));
      };
      setScrubMs(toMs(e.clientX));
      const onMove = (ev: MouseEvent) => setScrubMs(toMs(ev.clientX));
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const ms = toMs(ev.clientX);
        setScrubMs(null);
        seek(ms);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [canControl, contentMs, pxPerMs, seek],
  );

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
        mgr={tmgr}
        fps={timeline?.fps ?? 30}
        elementCount={elements.length}
        isPlaying={transport.isPlaying}
        canControl={canControl}
        loop={tmgr.loop}
        onPlayPause={transport.togglePlay}
        onStop={transport.stop}
        onSkipStart={() => seek(0)}
        onSkipEnd={() => seek(lengthMs)}
        onToggleLoop={transport.setLoop}
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
              <AnimTimeRuler
                contentMs={contentMs}
                pxPerMs={pxPerMs}
                widthPx={widthPx}
                onMouseDown={handleRulerMouseDown}
              />
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
