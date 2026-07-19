/**
 * @file components/panels/mdtraj/TrajBlockStrip.tsx
 * @description One track segment = one trajectory block (a TrajBlock file).
 *
 * Positioned from the block's `startIndex` (left) and `nframe` (width) on the
 * shared frame axis, so segments lie contiguously left-to-right in proportion
 * to their frame counts. Color is cycled by block position; the label is the
 * source-file basename plus a short format badge (XTC / DCD / TRR).
 *
 * Blocks are display + selection only for now. Remove / drag-reorder need new
 * C++ methods (Trajectory has no removeBlock / moveBlock) and are deferred.
 */

import React from 'react';
import type { TrajBlockInfo } from '../../../worker/server/services/trajectory.service';
import { Tooltip } from '../../../h3-kit/Tooltip';
import { frameToPx, blockColorIndex, basename } from './trackGeometry';

interface TrajBlockStripProps {
    block: TrajBlockInfo;
    /** Position of this block in the ordered list (drives the color slot). */
    index: number;
    pxPerFrame: number;
    selected: boolean;
    onSelect: (index: number) => void;
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
    onSelect,
}) => {
    const left = frameToPx(block.startIndex, pxPerFrame);
    const width = Math.max(MIN_BLOCK_PX, frameToPx(block.nframe, pxPerFrame));
    const colorIdx = blockColorIndex(index);
    const label = basename(block.src) || block.name || `block ${index + 1}`;
    const lastFrame = block.startIndex + Math.max(0, block.nframe - 1);
    const className =
        `mdtraj-block mdtraj-block--c${colorIdx}` + (selected ? ' is-selected' : '');

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
    // the tooltip handlers + ref directly to the block via renderTarget. The
    // block's own onClick/onMouseDown override Blueprint's (hover drives the
    // tooltip, so its click handlers are not needed).
    return (
        <Tooltip
            content={tooltip}
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
                    // Do not let a click on a block start a ruler scrub.
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(index);
                    }}
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
