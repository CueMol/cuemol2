/**
 * @file features/trajectory/mdtraj/TrajTrack.tsx
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

import React, { useCallback, useRef, useState } from 'react';
import type { TrajBlockInfo } from '@renderer/worker/server/services/traj/trajectory';
import { TrajBlockStrip } from './TrajBlockStrip';
import {
    frameToPx,
    pxToFrame,
    trackWidthPx,
    niceFrameStep,
} from './trackGeometry';

/** Min pixel travel before a block mousedown counts as a drag (vs a click). */
const DRAG_THRESHOLD_PX = 4;

/** Index of the block that owns a given frame (last block as a fallback). */
function frameToBlockIndex(frame: number, blocks: TrajBlockInfo[]): number {
    for (let i = 0; i < blocks.length; i++) {
        const start = blocks[i].startIndex;
        if (frame >= start && frame < start + blocks[i].nframe) return i;
    }
    return blocks.length - 1;
}

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
    /** Reorder: move the block at `from` to index `to` (block drag). */
    onReorderBlock: (from: number, to: number) => void;
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
    onReorderBlock,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    // While reordering: the dragged block index (`from`), its horizontal cursor
    // offset (`dx`), and the current drop target block index (`to`).
    const [dragState, setDragState] = useState<
        { from: number; dx: number; to: number } | null
    >(null);

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

    /**
     * Begin a block interaction: a bare click selects; a horizontal drag beyond
     * the threshold reorders the block to whichever block the cursor ends over.
     * The reorder commits once on release (the C++ event refetches the layout).
     */
    const handleBlockMouseDown = useCallback(
        (index: number, e: React.MouseEvent) => {
            if (e.button !== 0) return;
            e.stopPropagation(); // do not start a ruler scrub / lane deselect
            e.preventDefault(); // do not start a text selection while dragging
            const startX = e.clientX;
            let moved = false;
            const onMove = (ev: MouseEvent) => {
                if (!moved && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD_PX) {
                    moved = true;
                }
                if (moved) {
                    const to = frameToBlockIndex(clientXToFrame(ev.clientX), blocks);
                    setDragState({ from: index, dx: ev.clientX - startX, to });
                }
            };
            const onUp = (ev: MouseEvent) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                setDragState(null);
                if (!moved) {
                    onSelectBlock(index);
                    return;
                }
                const to = frameToBlockIndex(clientXToFrame(ev.clientX), blocks);
                if (to >= 0 && to !== index) onReorderBlock(index, to);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },
        [blocks, clientXToFrame, onSelectBlock, onReorderBlock],
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

    // Drop indicator (insertion line) shown while reordering: at the trailing
    // edge of the target when moving right, the leading edge when moving left.
    let dropIndicatorLeft: number | null = null;
    if (dragState && dragState.to !== dragState.from && blocks[dragState.to]) {
        const tb = blocks[dragState.to];
        dropIndicatorLeft =
            dragState.to > dragState.from
                ? frameToPx(tb.startIndex + tb.nframe, pxPerFrame)
                : frameToPx(tb.startIndex, pxPerFrame);
    }

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
                            key={b.uid}
                            block={b}
                            index={i}
                            pxPerFrame={pxPerFrame}
                            selected={selectedBlock === i}
                            dragging={dragState?.from === i}
                            dragOffsetPx={dragState?.from === i ? dragState.dx : 0}
                            dragActive={dragState !== null}
                            onMouseDownBlock={handleBlockMouseDown}
                        />
                    ))}
                    {blocks.length === 0 && (
                        <div className="mdtraj-empty-hint type-caption">
                            No blocks -- use Add to append a trajectory file
                        </div>
                    )}
                    {dropIndicatorLeft !== null && (
                        <div
                            className="mdtraj-drop-indicator"
                            style={{ left: dropIndicatorLeft }}
                            aria-hidden
                        />
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
