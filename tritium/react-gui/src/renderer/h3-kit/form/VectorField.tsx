/**
 * @file h3-kit/form/VectorField.tsx
 * @description Canonical editor for a 3- or 4-component vector: one
 * `NumberCell` per component, labelled x / y / z (/ w).
 *
 * The value is the C++ `qlib::Vector4D` string form, `(x,y,z)` or
 * `(x,y,z,w)` (`Vector4D::toString` / `fromStringS` in
 * `src/qlib/VectorHelper.cpp`), so a caller can hand a property value straight
 * through without knowing the layout. `onCommit` returns the same form, and the
 * component count of the incoming value is preserved -- a 3-vector stays a
 * 3-vector.
 *
 * Each cell commits on blur / Enter like the rest of the form-kit inputs. A
 * cell that cannot be parsed as a number is rejected and the field snaps back,
 * rather than writing a malformed vector the C++ parser would throw on.
 *
 * Sizing comes from `.h3-form-vector` plus `NumberCell`'s own
 * `.h3-form-number-cell` (see `styles/_form-kit.css`); no size prop is exposed.
 *
 * @module form/VectorField
 */

import React from 'react';
import { NumberCell } from './NumberCell';

void React; // classic JSX runtime (vitest)

/** Component labels, in order. */
const AXES = ['x', 'y', 'z', 'w'] as const;

export interface VectorFieldProps {
    /** `(x,y,z)` or `(x,y,z,w)`. Anything else renders as an empty 3-vector. */
    value: string;
    /** Fired on a cell's blur / Enter with the recomposed vector string. */
    onCommit: (value: string) => void;
    disabled?: boolean;
}

/**
 * Split the C++ vector string into its components. Returns null when the
 * value is not in `(...)` form so the caller can fall back to a blank field.
 */
export function parseVector(value: string): number[] | null {
    const s = value.trim();
    if (!s.startsWith('(') || !s.endsWith(')')) return null;
    const parts = s.slice(1, -1).split(',');
    if (parts.length < 3 || parts.length > 4) return null;
    const nums = parts.map((p) => Number(p.trim()));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums;
}

/** Recompose components into the C++ `(x,y,z[,w])` form. */
export function formatVector(nums: number[]): string {
    return `(${nums.join(',')})`;
}

export const VectorField: React.FC<VectorFieldProps> = ({
    value,
    onCommit,
    disabled,
}) => {
    const parsed = parseVector(value);
    // Unparseable input still gets an editable field so the user can fix it,
    // but the cells start blank rather than showing a misleading zero.
    const nums = parsed ?? [];
    const count = parsed ? parsed.length : 3;

    const commitAt = (index: number, text: string): void => {
        const next = Number(text.trim());
        if (!Number.isFinite(next)) return;
        const base = parsed ?? new Array<number>(count).fill(0);
        const out = base.slice();
        out[index] = next;
        if (next === base[index]) return;
        onCommit(formatVector(out));
    };

    return (
        <div className="h3-form-vector">
            {Array.from({ length: count }, (_, i) => (
                <label className="h3-form-vector-cell" key={AXES[i]}>
                    <span className="h3-form-vector-axis">{AXES[i]}</span>
                    <NumberCell
                        value={nums[i] === undefined ? '' : String(nums[i])}
                        onCommit={(text) => commitAt(i, text)}
                        disabled={disabled}
                        aria-label={AXES[i]}
                    />
                </label>
            ))}
        </div>
    );
};
