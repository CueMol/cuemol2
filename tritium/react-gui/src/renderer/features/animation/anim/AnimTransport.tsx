/**
 * @file features/animation/anim/AnimTransport.tsx
 * @description Timeline header: playback transport, time readout, start camera,
 * loop, and zoom.
 *
 * Playback controls drive the C++ `AnimMgr` via the parent's transport hook.
 * They are disabled when there is no active view (`canControl` false). The
 * start-camera select is a manager property (no view needed) and the zoom / fit
 * controls are pure view state, so both stay functional regardless.
 *
 * The current time is an editable `TimeField` on the ruler's scrub contract:
 * a gesture (drag, keys, stepper, Ctrl+wheel, a typed timecode) previews the
 * playhead locally and seeks once when it ends, so a long timeline is not
 * re-seeked per mouse move. The length beside it stays read-only: it is a
 * value the manager derives from its elements.
 */

import React from "react";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { ButtonRow, FormButton, SwitchField, SelectField, TimeField } from "@renderer/h3-kit/form";
import type { AnimMgrState } from "@renderer/types";
import { formatClock } from "./timelineGeometry";

interface AnimTransportProps {
  mgr: AnimMgrState;
  fps: number;
  elementCount: number;
  /** Whether playback is currently running. */
  isPlaying: boolean;
  /** Whether transport can act (cm + scene + active view present). */
  canControl: boolean;
  loop: boolean;
  /** Scene camera names offered by the start-camera select. */
  cameras: string[];
  /** Time shown in the current-time field: the scrub preview, else `mgr.elapsedMs`. */
  playheadMs: number;
  /** Current-time field gesture: preview locally, seek once on release, drop on cancel. */
  onScrubPreview: (ms: number) => void;
  onScrubCommit: (ms: number) => void;
  onScrubCancel: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onSkipStart: () => void;
  onSkipEnd: () => void;
  onToggleLoop: (loop: boolean) => void;
  /** Set `AnimMgr.startcam` ('' = none). */
  onStartCamChange: (name: string) => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/**
 * Render the transport / readout / start-cam / loop / zoom header row.
 */
export const AnimTransport: React.FC<AnimTransportProps> = ({
  mgr,
  fps,
  elementCount,
  isPlaying,
  canControl,
  loop,
  cameras,
  playheadMs,
  onScrubPreview,
  onScrubCommit,
  onScrubCancel,
  onPlayPause,
  onStop,
  onSkipStart,
  onSkipEnd,
  onToggleLoop,
  onStartCamChange,
  onFit,
  onZoomIn,
  onZoomOut,
}) => (
  <div className="anim-transport">
    <ButtonRow className="anim-transport-playback">
      <FormButton
        icon={<AppIcon name="media.skipBack" aria-hidden />}
        onClick={onSkipStart}
        disabled={!canControl}
        title="Skip to start"
      />
      <FormButton
        icon={<AppIcon name={isPlaying ? "media.pause" : "media.play"} aria-hidden />}
        onClick={onPlayPause}
        active={isPlaying}
        intent={isPlaying ? "warning" : "success"}
        disabled={!canControl}
        title={isPlaying ? "Pause" : "Play"}
      />
      <FormButton
        icon={<AppIcon name="media.stop" aria-hidden />}
        onClick={onStop}
        disabled={!canControl}
        title="Stop"
      />
      <FormButton
        icon={<AppIcon name="media.skipForward" aria-hidden />}
        onClick={onSkipEnd}
        disabled={!canControl}
        title="Skip to end"
      />
    </ButtonRow>

    <div className="anim-readout">
      <TimeField
        value={playheadMs}
        min={0}
        max={mgr.lengthMs}
        onChange={onScrubPreview}
        onRelease={onScrubCommit}
        onDragCancel={onScrubCancel}
        disabled={!canControl}
        aria-label="Current time"
      />
      <span className="anim-readout-sep">/</span>
      <span className="anim-readout-value type-mono">{formatClock(mgr.lengthMs)}</span>
    </div>

    <div className="anim-readout anim-startcam">
      <span className="anim-readout-label type-caption">Start cam</span>
      <SelectField
        value={cameras.includes(mgr.startcam) ? mgr.startcam : ""}
        onChange={onStartCamChange}
        aria-label="Start camera"
      >
        <option value="">(none)</option>
        {cameras.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </SelectField>
    </div>

    <div className="anim-readout anim-readout-meta">
      <span className="anim-readout-label type-caption">Loop</span>
      <SwitchField checked={loop} onChange={onToggleLoop} disabled={!canControl} />
      <span className="anim-readout-label type-caption">Elements</span>
      <span className="anim-readout-value type-mono">{elementCount}</span>
      <span className="anim-readout-label type-caption">FPS</span>
      <span className="anim-readout-value type-mono">{fps}</span>
    </div>

    <ButtonRow className="anim-zoom">
      <FormButton text="Fit" onClick={onFit} title="Fit timeline to width" />
      <FormButton
        icon={<AppIcon name="ui.remove" aria-hidden />}
        onClick={onZoomOut}
        title="Zoom out"
      />
      <FormButton
        icon={<AppIcon name="ui.add" aria-hidden />}
        onClick={onZoomIn}
        title="Zoom in"
      />
    </ButtonRow>
  </div>
);
