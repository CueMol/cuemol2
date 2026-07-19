/**
 * @file components/panels/mdtraj/TrajTrack.tsx
 * @description The trajectory track: a frame ruler, one lane of block segments,
 * and the seek playhead.
 *
 * The playhead is a vertical line that OVERLAPS the block segments (drawn above
 * them) with an upward triangle grip at the track bottom. Seeking is a
 * mousedown-drag on the ruler or the empty lane: the position is previewed
 * locally during the drag (no seek) and committed once on release -- the same
 * "local preview, single commit" pattern the Animation ruler uses, so a large
 * trajectory is not re-seeked on every mouse move. A bare click also seeks.
 */

import React, { useCallback, useRef } from 'react';
import type { TrajBlockInfo } from '../../../worker/server/services/trajectory.service';
import { TrajBlockStrip } from './TrajBlockStrip';
import {
    frameToPx,
    pxToFrame,
    trackWidthPx,
    niceFrameStep,
} from './trackGeometry';

interface TrajTrackProps {
    blocks: TrajBlockInfo[];
    nframe: number;
    /** Frame to draw the playhead at (already includes any scrub preview). */
    frame: number;
    pxPerFrame: number;
    /** Whether seeking is allowed (cm + scene + object + frames present). */
    canControl: boolean;
    selectedBlock: number | null;
    onSelectBlock: (index: number | null) => void;
    /** Live scrub preview during a drag (null clears the preview). */
    onScrubPreview: (frame: number | null) => void;
    /** Commit a frame on release / click. */
    onScrubCommit: (frame: number) => void;
}

/**
 * Render the frame ruler, block segments, and the seek playhead.
 */
export const TrajTrack: React.FC<TrajTrackProps> = ({
    blocks,
    nframe,
    frame,
    pxPerFrame,
    canControl,
    selectedBlock,
    onSelectBlock,
    onScrubPreview,
    onScrubCommit,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const widthPx = trackWidthPx(nframe, pxPerFrame);
    const playheadLeft = frameToPx(frame, pxPerFrame);

    /**
     * Convert a clientX to a frame index. Measured against the canvas element,
     * whose on-screen left already reflects both the horizontal scroll and the
     * canvas's left margin, so frame 0 maps to the canvas's left edge.
     */
    const clientXToFrame = useCallback(
        (clientX: number): number => {
            const canvas = canvasRef.current;
            if (!canvas) return 0;
            const rect = canvas.getBoundingClientRect();
            return pxToFrame(clientX - rect.left, pxPerFrame, nframe);
        },
        [pxPerFrame, nframe],
    );

    /**
     * Begin a playhead scrub. Previews locally during the drag and commits one
     * seek on release; a bare click (no movement) also commits one seek.
     */
    const handleScrubDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0 || !canControl || nframe <= 0) return;
            e.preventDefault();
            onScrubPreview(clientXToFrame(e.clientX));
            const onMove = (ev: MouseEvent) => onScrubPreview(clientXToFrame(ev.clientX));
            const onUp = (ev: MouseEvent) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                const f = clientXToFrame(ev.clientX);
                onScrubPreview(null);
                onScrubCommit(f);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },
        [canControl, nframe, clientXToFrame, onScrubPreview, onScrubCommit],
    );

    const step = niceFrameStep(pxPerFrame);
    const ticks: React.ReactNode[] = [];
    for (let t = 0; t <= nframe; t += step) {
        const left = frameToPx(t, pxPerFrame);
        if (left > widthPx) break;
        ticks.push(
            <div key={t} className="mdtraj-tick" style={{ left }}>
                <span className="mdtraj-tick-label type-caption">{t}</span>
            </div>,
        );
    }

    // Scrubbable areas get a seek cursor only when seeking is possible.
    const seekClass = canControl ? ' is-seekable' : '';

    return (
        <div className="mdtraj-track" ref={scrollRef}>
            <div className="mdtraj-canvas" ref={canvasRef} style={{ width: widthPx }}>
                <div className={`mdtraj-ruler${seekClass}`} onMouseDown={handleScrubDown}>
                    {ticks}
                </div>
                <div
                    className={`mdtraj-lane${seekClass}`}
                    onMouseDown={handleScrubDown}
                    onClick={() => onSelectBlock(null)}
                >
                    {blocks.map((b, i) => (
                        <TrajBlockStrip
                            key={`${b.uid}-${i}`}
                            block={b}
                            index={i}
                            pxPerFrame={pxPerFrame}
                            selected={selectedBlock === i}
                            onSelect={onSelectBlock}
                        />
                    ))}
                    {blocks.length === 0 && (
                        <div className="mdtraj-empty-hint type-caption">
                            No blocks -- use Add to append a trajectory file
                        </div>
                    )}
                </div>
                {/* Seek gutter below the blocks: houses the playhead triangle
                    grip and is draggable to scrub. */}
                <div
                    className={`mdtraj-grip-gutter${seekClass}`}
                    onMouseDown={handleScrubDown}
                />
                {/* Playhead: a vertical line overlapping the blocks; the upward
                    triangle grip sits in the gutter below them. */}
                <div className="mdtraj-playhead" style={{ left: playheadLeft }} aria-hidden>
                    <div className="mdtraj-playhead-grip" />
                </div>
            </div>
        </div>
    );
};
