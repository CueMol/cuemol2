/**
 * @file components/panels/anim/AnimTransport.tsx
 * @description Timeline header: playback transport, time readout, and zoom.
 *
 * Playback controls (play / stop / skip) are wired to the C++ `AnimMgr` in a
 * later phase; here they are shown disabled. The zoom / fit controls are pure
 * view state and are functional now.
 */

import React from "react";
import { AppIcon } from "../../AppIcon";
import { ButtonRow, FormButton } from "../../../h3-kit/form/ButtonRow";
import type { AnimMgrState } from "../../../types";
import { formatClock } from "./timelineGeometry";

interface AnimTransportProps {
  mgr: AnimMgrState;
  fps: number;
  elementCount: number;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/**
 * Render the transport / readout / zoom header row.
 */
export const AnimTransport: React.FC<AnimTransportProps> = ({
  mgr,
  fps,
  elementCount,
  onFit,
  onZoomIn,
  onZoomOut,
}) => (
  <div className="anim-transport">
    <ButtonRow className="anim-transport-playback">
      <FormButton
        icon={<AppIcon name="media.skipBack" aria-hidden />}
        disabled
        title="Skip to start (playback wiring pending)"
      />
      <FormButton
        icon={<AppIcon name="media.play" aria-hidden />}
        disabled
        title="Play (playback wiring pending)"
      />
      <FormButton
        icon={<AppIcon name="media.stop" aria-hidden />}
        disabled
        title="Stop (playback wiring pending)"
      />
      <FormButton
        icon={<AppIcon name="media.skipForward" aria-hidden />}
        disabled
        title="Skip to end (playback wiring pending)"
      />
    </ButtonRow>

    <div className="anim-readout">
      <span className="anim-readout-value type-mono">{formatClock(mgr.elapsedMs)}</span>
      <span className="anim-readout-sep">/</span>
      <span className="anim-readout-value type-mono">{formatClock(mgr.lengthMs)}</span>
    </div>

    <div className="anim-readout anim-readout-meta">
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
