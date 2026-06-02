/**
 * @file h3-kit/MolSelList/CountTag.tsx
 * @description Small Tag rendering a selection hit-count, shared by the
 * SelectionBuilder (term / apply-op previews) and the SelectionPane (the
 * current-selection badge shown inside the selection text field). Warning
 * (red) intent when the count is zero so an empty selection is obvious;
 * renders nothing while N/A or uncountable.
 *
 * @module CountTag
 */

import React from 'react';
import { Tag } from '@blueprintjs/core';
import type { HitCount } from './useSelHitCount';

/** Render a hit-count as a Tag, warning (red) when the selection is empty. */
export const CountTag: React.FC<{ count: HitCount }> = ({ count }) => {
    if (count === undefined) return null;
    if (count === 'loading') return <Tag minimal round className="selbuilder-count">...</Tag>;
    if (count === null) return null;
    return (
        <Tag minimal round intent={count === 0 ? 'warning' : 'none'} className="selbuilder-count">
            {count}
        </Tag>
    );
};
