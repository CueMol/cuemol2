/**
 * @file components/panels/anim/AnimTransport.tsx
 * @description Timeline header: playback transport, time readout, loop, and zoom.
 *
 * Playback controls drive the C++ `AnimMgr` via the parent's transport hook.
 * They are disabled when there is no active view (`canControl` false). The
 * zoom / fit controls are pure view state and always functional.
 */

import React from "react";
import { AppIcon } from "../../AppIcon";
import { ButtonRow, FormButton } from "../../../h3-kit/form/ButtonRow";
import { SwitchField } from "../../../h3-kit/form/SwitchField";
import type { AnimMgrState } from "../../../types";
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
  onPlayPause: () => void;
  onStop: () => void;
  onSkipStart: () => void;
  onSkipEnd: () => void;
  onToggleLoop: (loop: boolean) => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/**
 * Render the transport / readout / loop / zoom header row.
 */
export const AnimTransport: React.FC<AnimTransportProps> = ({
  mgr,
  fps,
  elementCount,
  isPlaying,
  canControl,
  loop,
  onPlayPause,
  onStop,
  onSkipStart,
  onSkipEnd,
  onToggleLoop,
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
      <span className="anim-readout-value type-mono">{formatClock(mgr.elapsedMs)}</span>
      <span className="anim-readout-sep">/</span>
      <span className="anim-readout-value type-mono">{formatClock(mgr.lengthMs)}</span>
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
