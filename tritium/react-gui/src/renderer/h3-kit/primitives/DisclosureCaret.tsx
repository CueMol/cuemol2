/**
 * @file h3-kit/primitives/DisclosureCaret.tsx
 * @description The one expand/collapse chevron. Every disclosure affordance in
 * the app -- pane section headers, tree rows (through `ListboxTree`), the
 * inspector accordions, the settings tree, collapsible dialog sections --
 * renders this, so they all share one glyph, one stroke weight, one size and
 * one color, the way VS Code's tree twisties and section chevrons are a
 * single codicon.
 *
 * It owns its size: `--icon-caret` (16px, Blueprint's standard icon size, so
 * a caret drawn here sits where Blueprint's own tree caret used to). That is
 * deliberately off the sm/md/lg ladder; consumers never pick a size. The
 * glyph is the registry's `ui.caretRight` / `ui.caretDown` (Phosphor, regular
 * weight) -- the thin stroke the pane headers always had. Blueprint's filled
 * `chevron-right`, which the trees used to draw, read visibly heavier next to
 * it at the same size.
 *
 * `leaf` keeps the box and draws nothing, so a row without children keeps its
 * label aligned with siblings that carry a caret.
 */

import React from 'react';
import { AppIcon } from './AppIcon';

/** Caret glyph size in px. Mirrors `--icon-caret` in `styles/_variables.css`. */
export const CARET_PX = 16;

export interface DisclosureCaretProps {
    /** Points down when expanded, right when collapsed. */
    expanded: boolean;
    /** Alignment placeholder: same box, no glyph (rows without children). */
    leaf?: boolean;
    className?: string;
    title?: string;
}

/**
 * Render the disclosure caret. Decorative on its own (`aria-hidden`); the
 * click target and its label belong to the header or row that contains it.
 */
export const DisclosureCaret: React.FC<DisclosureCaretProps> = ({
    expanded,
    leaf,
    className,
    title,
}) => (
    <span
        className={`h3-caret${className ? ` ${className}` : ''}`}
        data-expanded={leaf ? undefined : expanded}
        title={title}
        aria-hidden
    >
        {!leaf && (
            <AppIcon name={expanded ? 'ui.caretDown' : 'ui.caretRight'} size={CARET_PX} aria-hidden />
        )}
    </span>
);
