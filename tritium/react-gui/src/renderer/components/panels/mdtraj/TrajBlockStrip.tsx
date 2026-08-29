/**
 * @file components/panels/mdtraj/TrajBlockStrip.tsx
 * @description One track segment = one trajectory block (a TrajBlock file).
 *
 * Positioned from the block's `startIndex` (left) and `nframe` (width) on the
 * shared frame axis, so segments lie contiguously left-to-right in proportion
 * to their frame counts. Color is cycled by block position; the label is the
 * source-file basename plus a short format badge (XTC / DCD / TRR).
 *
 * Mousedown is forwarded to the parent track, which decides click-to-select vs
 * drag-to-reorder (it owns the geometry of all blocks).
 */

import React from 'react';
import type { TrajBlockInfo } from '@renderer/worker/server/services/trajectory.service';
import { Tooltip } from '@renderer/h3-kit/Tooltip';
import { frameToPx, blockColorIndex, basename } from './trackGeometry';

interface TrajBlockStripProps {
    block: TrajBlockInfo;
    /** Position of this block in the ordered list (drives the color slot). */
    index: number;
    pxPerFrame: number;
    selected: boolean;
    /** True while this block is being dragged to reorder. */
    dragging: boolean;
    /** Horizontal offset (px) while dragging, so the block follows the cursor. */
    dragOffsetPx: number;
    /** True while ANY block drag is in progress (suppresses the tooltip). */
    dragActive: boolean;
    /** Begin a click-or-drag interaction (parent distinguishes the two). */
    onMouseDownBlock: (index: number, e: React.MouseEvent) => void;
}

/** Minimum visible width so a tiny block stays clickable. */
const MIN_BLOCK_PX = 3;

/**
 * Render a single trajectory block as a positioned track segment.
 *
 * @param block - The block metadata (src / nframe / startIndex / format).
 * @param index - Ordinal position (color slot).
 * @param pxPerFrame - Current horizontal scale.
 * @param selected - Whether this block is selected.
 * @param onSelect - Called with the block index on click.
 */
export const TrajBlockStrip: React.FC<TrajBlockStripProps> = ({
    block,
    index,
    pxPerFrame,
    selected,
    dragging,
    dragOffsetPx,
    dragActive,
    onMouseDownBlock,
}) => {
    const left = frameToPx(block.startIndex, pxPerFrame) + (dragging ? dragOffsetPx : 0);
    const width = Math.max(MIN_BLOCK_PX, frameToPx(block.nframe, pxPerFrame));
    // Color by the block's stable uid (not its position), so the color follows
    // the block on reorder and makes a move visually obvious.
    const colorIdx = blockColorIndex(block.uid);
    const label = basename(block.src) || block.name || `block ${index + 1}`;
    const lastFrame = block.startIndex + Math.max(0, block.nframe - 1);
    const className =
        `mdtraj-block mdtraj-block--c${colorIdx}` +
        (selected ? ' is-selected' : '') +
        (dragging ? ' is-dragging' : '');

    // Hover info: frame range and full source path (the name + format are
    // already shown on the block itself, so they are not repeated here).
    const tooltip = (
        <span className="mdtraj-block-tip">
            {block.nframe} frames ({block.startIndex}..{lastFrame})
            {block.src ? (
                <>
                    <br />
                    {block.src}
                </>
            ) : null}
        </span>
    );

    // The block is absolutely positioned, so it cannot use the default tooltip
    // target span (that wrapper would be zero-size and never hovered). Attach
    // the tooltip handlers + ref directly to the block via renderTarget.
    // Mousedown goes to the parent track, which handles click-select vs
    // drag-reorder (and stops the ruler scrub).
    return (
        <Tooltip
            content={tooltip}
            disabled={dragActive}
            renderTarget={({ isOpen, ref, ...targetProps }) => (
                <div
                    {...targetProps}
                    ref={ref as React.Ref<HTMLDivElement>}
                    data-open={isOpen ? '' : undefined}
                    className={
                        targetProps.className
                            ? `${className} ${targetProps.className}`
                            : className
                    }
                    style={{ left, width }}
                    data-index={index}
                    onMouseDown={(e) => onMouseDownBlock(index, e)}
                    // Prevent the lane's click-to-deselect from firing on a
                    // block click (selection is handled in onMouseDownBlock).
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className="mdtraj-block-label">{label}</span>
                    {block.format && (
                        <span className="mdtraj-block-badge type-caption">{block.format}</span>
                    )}
                </div>
            )}
        />
    );
};
