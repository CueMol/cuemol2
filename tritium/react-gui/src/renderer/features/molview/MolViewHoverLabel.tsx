/**
 * @file features/molview/MolViewHoverLabel.tsx
 * @description The hover label of the 3D view: a small chip in the bottom-left
 * corner of the content pane naming what is under the pointer.
 *
 * Owns the hover state so that pointer movement re-renders this component
 * alone, never the pane or the canvas. Line 1 is the identity (chain badge,
 * residue, and the atom for atom-level renderers), line 2 the object and
 * renderer it belongs to. The chip is click-through (pointer-events: none),
 * so it never steals the hover it describes.
 */

import React, { useState } from 'react';
import type { HoverLabel } from './useHoverInfoHandler';
import { useHoverInfoHandler } from './useHoverInfoHandler';

export interface MolViewHoverLabelProps {
    /** The `.content-pane` element the pointer events are read from. */
    containerRef: React.RefObject<HTMLElement | null>;
}

/** Primary line: `ALA 10` (+ ` CA` for atom-level hits), or the plain text. */
export function hoverPrimaryText(label: HoverLabel): string {
    if (label.text !== undefined) return label.text;
    const res = [label.resName, label.resIndex].filter((v) => v).join(' ');
    return label.atomName ? `${res} ${label.atomName}` : res;
}

/** Secondary line: `1CRN | cartoon1` (+ ` | symop`). */
export function hoverSecondaryText(label: HoverLabel): string {
    const parts = [label.objName, label.rendName];
    if (label.symop) parts.push(label.symop);
    return parts.filter((v) => v).join('  |  ');
}

export const MolViewHoverLabel: React.FC<MolViewHoverLabelProps> = ({ containerRef }) => {
    const [label, setLabel] = useState<HoverLabel | null>(null);
    useHoverInfoHandler({ containerRef, setHoverLabel: setLabel });

    if (label === null) return null;
    return (
        <div className="molview-hover-label" role="status" aria-live="polite">
            <div className="molview-hover-primary type-panel-title">
                {label.chain !== undefined && (
                    <span className="molview-hover-chain type-caption" title="Chain">
                        {label.chain}
                    </span>
                )}
                <span>{hoverPrimaryText(label)}</span>
            </div>
            <div className="molview-hover-secondary type-caption">{hoverSecondaryText(label)}</div>
        </div>
    );
};
