/**
 * @file h3-kit/MolSelList/CountTag.tsx
 * @description Small Tag rendering a selection hit-count, shared by the
 * SelectionBuilder (term / apply-op previews) and the SelectionPane (the
 * current-selection badge shown inside the selection text field). Warning
 * (red) intent when the count is zero so an empty selection is obvious;
 * renders nothing while N/A or uncountable. Large counts are abbreviated so
 * the badge width stays bounded (an unbounded badge overflows the compact op
 * buttons); the exact count shows on hover.
 *
 * @module CountTag
 */

import React from 'react';
import { Tag } from '@blueprintjs/core';
import type { HitCount } from './useSelHitCount';

/**
 * Abbreviate a count so the badge never exceeds ~4 characters:
 * 9999 -> "9999", 12345 -> "12k", 123456 -> "123k", 1234567 -> "1.2M".
 */
function formatCount(n: number): string {
    if (n < 10_000) return String(n);
    if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
}

/** Render a hit-count as a Tag, warning (red) when the selection is empty. */
export const CountTag: React.FC<{ count: HitCount }> = ({ count }) => {
    if (count === undefined) return null;
    if (count === 'loading') return <Tag minimal round className="selbuilder-count">...</Tag>;
    if (count === null) return null;
    const label = formatCount(count);
    return (
        <Tag
            minimal
            round
            intent={count === 0 ? 'warning' : 'none'}
            className="selbuilder-count"
            htmlTitle={label === String(count) ? undefined : String(count)}
        >
            {label}
        </Tag>
    );
};
