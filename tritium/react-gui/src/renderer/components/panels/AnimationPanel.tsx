/**
 * @file AnimationPanel.tsx
 * @description Blender-style animation timeline panel.
 *
 * ## Layout
 *
 * ```
 * ┌───────────────┬──────────────────────────────────────────┐
 * │  [|◀ ▶ ▶|]   │  Frame: [120]  / 300   FPS: [30]        │ ← transport bar
 * ├───────────────┼──────────────────────────────────────────┤
 * │               │  0   30   60   90  120  150  ...         │ ← frame ruler
 * ├───────────────┼──────────────────────────────────────────┤
 * │  Camera       │  ◆────────────◆──────────◆              │ ← keyframe tracks
 * │  Mol1 Opacity │  ◆──────◆                               │
 * │  Light        │       ◆─────────────────◆               │
 * └───────────────┴──────────────────────────────────────────┘
 * ```
 *
 * Features:
 * - Transport controls (play/pause, step, skip to start/end)
 * - Frame ruler with tick marks
 * - Draggable playhead
 * - Named tracks with keyframe diamonds
 * - Playback animation via requestAnimationFrame
 *
 * @module AnimationPanel
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { Icon, Button, ButtonGroup, NumericInput } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import type { AnimationData, AnimationTrack, Keyframe } from "../../types";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Pixels per frame on the timeline. */
const PX_PER_FRAME = 4;
/** Height of each keyframe track row. */
const TRACK_HEIGHT = 24;
/** Height of the frame ruler. */
const RULER_HEIGHT = 22;
/** Width of the track label column. */
const TRACK_LABEL_WIDTH = 140;

// ────────────────────────────────────────────────────────────
// Sub-component: FrameRuler
// ────────────────────────────────────────────────────────────

interface FrameRulerProps {
  /** Total number of frames in the animation. */
  totalFrames: number;
  /** Frames per second (used to determine major tick interval). */
  fps: number;
}

/**
 * Horizontal ruler showing frame numbers.
 * Major ticks appear at FPS intervals; minor ticks at half-FPS intervals.
 */
const FrameRuler: React.FC<FrameRulerProps> = ({ totalFrames, fps }) => {
  const ticks: JSX.Element[] = [];
  const majorInterval = fps;
  const minorInterval = Math.max(1, Math.round(fps / 2));

  for (let f = 0; f <= totalFrames; f++) {
    if (f % majorInterval === 0) {
      ticks.push(
        <div
          key={`t-${f}`}
          className="anim-ruler-tick anim-ruler-major"
          style={{ left: f * PX_PER_FRAME }}
        >
          <span className="anim-ruler-label">{f}</span>
          <span className="anim-ruler-mark" />
        </div>
      );
    } else if (f % minorInterval === 0) {
      ticks.push(
        <div
          key={`t-${f}`}
          className="anim-ruler-tick anim-ruler-minor"
          style={{ left: f * PX_PER_FRAME }}
        />
      );
    }
  }

  return (
    <div className="anim-ruler" style={{ height: RULER_HEIGHT }}>
      <div
        className="anim-ruler-track"
        style={{ width: totalFrames * PX_PER_FRAME, position: "relative" }}
      >
        {ticks}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-component: KeyframeTrack
// ────────────────────────────────────────────────────────────

interface KeyframeTrackRowProps {
  /** Track data with keyframes. */
  track: AnimationTrack;
  /** Total frames for rendering the track bar. */
  totalFrames: number;
  /** Whether this track is selected. */
  selected: boolean;
  /** Called when a keyframe diamond is clicked. */
  onKeyframeClick?: (trackId: string, frame: number) => void;
}

/**
 * A single row showing keyframe diamonds on a horizontal timeline.
 * Adjacent keyframes are connected by a thin bar to show interpolation range.
 */
const KeyframeTrackRow: React.FC<KeyframeTrackRowProps> = ({
  track,
  totalFrames,
  selected,
  onKeyframeClick,
}) => {
  const sortedKeys = useMemo(
    () => [...track.keyframes].sort((a, b) => a.frame - b.frame),
    [track.keyframes]
  );

  return (
    <div
      className={`anim-track-row ${selected ? "anim-track-selected" : ""}`}
      style={{ height: TRACK_HEIGHT }}
    >
      <div
        className="anim-track-canvas"
        style={{ width: totalFrames * PX_PER_FRAME }}
      >
        {/* Interpolation bars between consecutive keyframes */}
        {sortedKeys.map((kf, i) => {
          if (i === sortedKeys.length - 1) return null;
          const next = sortedKeys[i + 1];
          const left = kf.frame * PX_PER_FRAME;
          const width = (next.frame - kf.frame) * PX_PER_FRAME;
          return (
            <div
              key={`bar-${kf.frame}-${next.frame}`}
              className="anim-interp-bar"
              style={{ left, width }}
            />
          );
        })}

        {/* Keyframe diamonds */}
        {sortedKeys.map((kf) => (
          <div
            key={`kf-${kf.frame}`}
            className={`anim-keyframe ${kf.selected ? "anim-kf-selected" : ""}`}
            style={{ left: kf.frame * PX_PER_FRAME }}
            onClick={() => onKeyframeClick?.(track.id, kf.frame)}
            title={`Frame ${kf.frame}: ${kf.value}`}
          />
        ))}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

interface AnimationPanelProps {
  /** Animation data including tracks, total frames, and FPS. */
  animation: AnimationData | null;
}

/**
 * Blender-style animation timeline panel.
 *
 * Manages playback state (current frame, playing/paused) locally.
 * Provides transport controls, a draggable playhead, frame ruler,
 * and keyframe tracks with diamond markers.
 */
export const AnimationPanel: React.FC<AnimationPanelProps> = ({ animation }) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const totalFrames = animation?.totalFrames ?? 300;
  const fps = animation?.fps ?? 30;
  const tracks = animation?.tracks ?? [];

  // ── Playback loop ──────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastTimeRef.current;
      const frameDuration = 1000 / fps;

      if (elapsed >= frameDuration) {
        lastTimeRef.current = now - (elapsed % frameDuration);
        setCurrentFrame((prev) => {
          const next = prev + 1;
          if (next > totalFrames) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, fps, totalFrames]);

  // ── Transport controls ─────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame(0);
  }, []);

  const handleStepBack = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame((prev) => Math.max(0, prev - 1));
  }, []);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame((prev) => Math.min(totalFrames, prev + 1));
  }, [totalFrames]);

  const handleSkipStart = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame(0);
  }, []);

  const handleSkipEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame(totalFrames);
  }, [totalFrames]);

  // ── Playhead drag on ruler / timeline ──────────────────────

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const scrollLeft = e.currentTarget.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const frame = Math.round(x / PX_PER_FRAME);
      setCurrentFrame(Math.max(0, Math.min(totalFrames, frame)));
    },
    [totalFrames]
  );

  /** Sync vertical scroll between labels and tracks. */
  const handleTrackScroll = useCallback(() => {
    if (timelineRef.current && labelScrollRef.current) {
      labelScrollRef.current.scrollTop = timelineRef.current.scrollTop;
    }
  }, []);

  // ── Frame input handler ────────────────────────────────────

  const handleFrameChange = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(totalFrames, Math.round(val)));
      setCurrentFrame(clamped);
    },
    [totalFrames]
  );

  // ── Empty state ────────────────────────────────────────────

  if (!animation) {
    return (
      <div className="animation-panel">
        <div className="anim-placeholder">
          <Icon icon="timeline-events" size={48} className="placeholder-icon" />
          <div>No animation data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animation-panel">
      {/* ── Transport bar ── */}
      <div className="anim-transport">
        <div className="anim-transport-controls">
          <ButtonGroup minimal>
            <Button
              icon="step-backward"
              small
              onClick={handleSkipStart}
              title="Skip to start"
            />
            <Button
              icon="chevron-backward"
              small
              onClick={handleStepBack}
              title="Step back"
            />
            <Button
              icon={isPlaying ? "pause" : "play"}
              small
              intent={isPlaying ? "warning" : "success"}
              onClick={handlePlayPause}
              title={isPlaying ? "Pause" : "Play"}
            />
            <Button
              icon="stop"
              small
              onClick={handleStop}
              title="Stop"
            />
            <Button
              icon="chevron-forward"
              small
              onClick={handleStepForward}
              title="Step forward"
            />
            <Button
              icon="step-forward"
              small
              onClick={handleSkipEnd}
              title="Skip to end"
            />
          </ButtonGroup>
        </div>

        <div className="anim-transport-info">
          <span className="anim-info-label">Frame:</span>
          <NumericInput
            value={currentFrame}
            onValueChange={handleFrameChange}
            min={0}
            max={totalFrames}
            stepSize={1}
            minorStepSize={1}
            majorStepSize={fps}
            small
            fill={false}
            className="anim-frame-input"
          />
          <span className="anim-info-total">/ {totalFrames}</span>
          <span className="anim-info-separator" />
          <span className="anim-info-label">FPS:</span>
          <span className="anim-info-value">{fps}</span>
          <span className="anim-info-separator" />
          <span className="anim-info-label">Time:</span>
          <span className="anim-info-value">
            {(currentFrame / fps).toFixed(2)}s
          </span>
        </div>
      </div>

      {/* ── Timeline body ── */}
      <div className="anim-body">
        {/* Track labels */}
        <div className="anim-label-column" style={{ width: TRACK_LABEL_WIDTH }}>
          <div className="anim-label-spacer" style={{ height: RULER_HEIGHT }} />
          <div className="anim-label-scroll" ref={labelScrollRef}>
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`anim-label ${selectedTrack === track.id ? "anim-track-selected" : ""}`}
                style={{ height: TRACK_HEIGHT }}
                onClick={() =>
                  setSelectedTrack((prev) =>
                    prev === track.id ? null : track.id
                  )
                }
              >
                <Icon icon={(track.icon ?? "key") as IconName} size={12} />
                <span className="anim-label-text">{track.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline tracks */}
        <div
          className="anim-timeline"
          ref={timelineRef}
          onScroll={handleTrackScroll}
        >
          {/* Ruler */}
          <div className="anim-ruler-wrapper" onClick={handleTimelineClick}>
            <FrameRuler totalFrames={totalFrames} fps={fps} />
            {/* Playhead on ruler */}
            <div
              className="anim-playhead-marker"
              style={{ left: currentFrame * PX_PER_FRAME }}
            />
          </div>

          {/* Track rows */}
          <div className="anim-tracks-scroll" onClick={handleTimelineClick}>
            <div
              className="anim-tracks-inner"
              style={{ minWidth: totalFrames * PX_PER_FRAME }}
            >
              {tracks.map((track) => (
                <KeyframeTrackRow
                  key={track.id}
                  track={track}
                  totalFrames={totalFrames}
                  selected={selectedTrack === track.id}
                />
              ))}
            </div>

            {/* Playhead line across all tracks */}
            <div
              className="anim-playhead"
              style={{ left: currentFrame * PX_PER_FRAME }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
