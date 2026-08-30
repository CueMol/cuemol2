/**
 * @file components/panels/mdtraj/TrajTransport.tsx
 * @description Trajectory pane header: playback transport, frame readout /
 * spinbox, loop + speed, and zoom.
 *
 * Playback is driven by a JS timer in `useTrajPlayback` (a Trajectory has no
 * C++ playback engine). Controls are disabled when there is no selected
 * trajectory with frames (`canControl` false). The zoom / fit controls are
 * pure view state and always functional.
 */

import React, { useEffect, useState } from 'react';
import { AppIcon } from '@renderer/h3-kit/primitives';
import { ButtonRow, FormButton, SwitchField, SelectField, NumericField } from '@renderer/h3-kit/form';

interface TrajTransportProps {
    /** Rendered at the far left of the row (the target-object selector). */
    leftSlot?: React.ReactNode;
    frame: number;
    nframe: number;
    isPlaying: boolean;
    canControl: boolean;
    loop: boolean;
    fps: number;
    onPlayPause: () => void;
    onStop: () => void;
    onSkipStart: () => void;
    onSkipEnd: () => void;
    onToggleLoop: (loop: boolean) => void;
    onSetFps: (fps: number) => void;
    /** Commit a frame typed into the spinbox. */
    onCommitFrame: (frame: number) => void;
    onFit: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
}

/** Selectable playback rates (frames per second). */
const FPS_OPTIONS = [1, 2, 5, 10, 15, 24, 30, 60];

/**
 * Render the transport / frame-readout / loop+speed / zoom header row.
 */
export const TrajTransport: React.FC<TrajTransportProps> = ({
    leftSlot,
    frame,
    nframe,
    isPlaying,
    canControl,
    loop,
    fps,
    onPlayPause,
    onStop,
    onSkipStart,
    onSkipEnd,
    onToggleLoop,
    onSetFps,
    onCommitFrame,
    onFit,
    onZoomIn,
    onZoomOut,
}) => {
    // Local draft so typing does not seek mid-entry; resyncs when the live
    // frame changes (e.g. during playback / scrub).
    const [draft, setDraft] = useState(frame);
    useEffect(() => setDraft(frame), [frame]);

    const lastFrame = Math.max(0, nframe - 1);

    return (
        <div className="mdtraj-transport">
            {leftSlot}
            <ButtonRow className="mdtraj-transport-playback">
                <FormButton
                    icon={<AppIcon name="media.skipBack" aria-hidden />}
                    onClick={onSkipStart}
                    disabled={!canControl}
                    title="Skip to start"
                />
                <FormButton
                    icon={<AppIcon name={isPlaying ? 'media.pause' : 'media.play'} aria-hidden />}
                    onClick={onPlayPause}
                    active={isPlaying}
                    intent={isPlaying ? 'warning' : 'success'}
                    disabled={!canControl}
                    title={isPlaying ? 'Pause' : 'Play'}
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

            <div className="mdtraj-readout">
                <span className="mdtraj-readout-label type-caption">Frame</span>
                <NumericField
                    value={draft}
                    onChange={setDraft}
                    onRelease={onCommitFrame}
                    min={0}
                    max={lastFrame}
                    step={1}
                    slider={false}
                    disabled={!canControl}
                />
                <span className="mdtraj-readout-sep">/</span>
                <span className="mdtraj-readout-value type-mono">{lastFrame}</span>
            </div>

            <div className="mdtraj-readout mdtraj-readout-meta">
                <span className="mdtraj-readout-label type-caption">Loop</span>
                <SwitchField checked={loop} onChange={onToggleLoop} disabled={!canControl} />
                <span className="mdtraj-readout-label type-caption">Speed</span>
                <SelectField
                    value={String(fps)}
                    onChange={(v) => onSetFps(Number(v))}
                    disabled={!canControl}
                    fill={false}
                    aria-label="Playback speed (fps)"
                >
                    {FPS_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                            {f} fps
                        </option>
                    ))}
                </SelectField>
            </div>

            <ButtonRow className="mdtraj-zoom">
                <FormButton text="Fit" onClick={onFit} title="Fit track to width" />
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
};
