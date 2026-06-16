/**
 * @file h3-kit/form/RejectNumberInput.tsx
 * @description Bare numeric `<input type="number">` with REJECT-and-revert
 * validation: an out-of-range or non-numeric (NaN) entry is silently dropped
 * and the field snaps back to the current value, with NO `onCommit` firing.
 *
 * This is intentionally distinct from the catalog `NumericField` / `SliderField`,
 * which CLAMP out-of-range input. Reject semantics mirror the UXP coloring-panel
 * validation (`onRainbowChange` / `onBfacChange`), where typing a value outside
 * the allowed range leaves the property unchanged rather than pinning it to the
 * bound. Use this widget when a blind clamp would change behaviour.
 *
 * It also carries the stored<->shown `scale` transform (stored value is
 * `shown / scale`; e.g. show 0-100 for a 0-1 stored property) and an
 * `editText`-style empty-field guard inherent in the draft-string model:
 * clearing the field then blurring reverts to the current value instead of
 * committing 0.
 *
 * Sizing / border / background come from `.h3-form-reject-num` in
 * `styles/_form-kit.css`; no size prop is exposed.
 *
 * @module form/RejectNumberInput
 */

import React, { useEffect, useState } from 'react';

export interface RejectNumberInputProps {
    /** Stored value (post-`scale` division). */
    value: number;
    /** Inclusive lower bound; entries below it are rejected. Omit for none. */
    min?: number;
    /** Inclusive upper bound; entries above it are rejected. Omit for none. */
    max?: number;
    /**
     * Ratio between the displayed value and the stored value
     * (`displayed = stored * scale`). Defaults to 1.
     */
    scale?: number;
    /**
     * When set, the committed stored value is rounded to `decimals + 4` places
     * (matching the legacy coloring-panel NumberField precision guard). Omit to
     * commit the raw `shown / scale`.
     */
    decimals?: number;
    /** Fired with the STORED value on a valid, in-range, changed commit. */
    onCommit: (next: number) => void;
    disabled?: boolean;
    /** Extra class on the input (layout only -- never sizing). */
    className?: string;
}

/**
 * Numeric input that rejects (reverts) invalid / out-of-range entries instead
 * of clamping them. See the file header for the reject contract, the `scale`
 * transform and the empty-field guard.
 */
export const RejectNumberInput: React.FC<RejectNumberInputProps> = ({
    value,
    min,
    max,
    scale = 1,
    decimals,
    onCommit,
    disabled,
    className,
}) => {
    const shown = (value * scale).toString();
    const [draft, setDraft] = useState(shown);
    useEffect(() => setDraft(shown), [shown]);

    const commit = () => {
        const parsed = parseFloat(draft);
        if (isNaN(parsed)) {
            setDraft(shown);
            return;
        }
        if (min !== undefined && parsed < min) {
            setDraft(shown);
            return;
        }
        if (max !== undefined && parsed > max) {
            setDraft(shown);
            return;
        }
        const stored = parsed / scale;
        const fixed = decimals !== undefined ? Number(stored.toFixed(decimals + 4)) : stored;
        if (fixed !== value) onCommit(fixed);
    };

    return (
        <input
            className={`h3-form-reject-num${className ? ` ${className}` : ''}`}
            type="number"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
            }}
        />
    );
};
