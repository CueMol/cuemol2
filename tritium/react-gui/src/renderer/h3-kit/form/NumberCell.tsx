/**
 * @file h3-kit/form/NumberCell.tsx
 * @description Bare compact numeric input cell -- a narrow box wide enough for a
 * couple of digits, with no slider, spinner buttons or unit. Use it when several
 * tiny numbers sit side by side (e.g. the atomintr dash/gap stipple pattern)
 * where a full `NumericField` row would be far too wide.
 *
 * The value is a string so callers can represent an "empty"/sentinel state
 * (e.g. a disabled dash segment shown blank). It commits on blur / Enter via
 * `onCommit`, mirroring the other form-kit text inputs. Width / height / border
 * are owned by `.h3-form-number-cell` (see `styles/_form-kit.css`); no size prop
 * is exposed.
 *
 * @module form/NumberCell
 */

import React, { useEffect, useState } from 'react';

export interface NumberCellProps {
    /** Display string; may be empty to show a blank cell. */
    value: string;
    /** Fired on blur / Enter with the current draft text. */
    onCommit: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    'aria-label'?: string;
}

export const NumberCell: React.FC<NumberCellProps> = ({
    value,
    onCommit,
    disabled,
    placeholder,
    'aria-label': ariaLabel,
}) => {
    const [draft, setDraft] = useState(value);
    // Re-sync the draft when the committed value changes from outside.
    useEffect(() => {
        setDraft(value);
    }, [value]);

    const commit = () => {
        if (draft !== value) onCommit(draft);
    };

    return (
        <input
            className="h3-form-number-cell"
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
            }}
        />
    );
};
