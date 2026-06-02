/**
 * @file h3-kit/form/ColorField.tsx
 * @description Canonical colour editor -- a thin catalog alias over
 * `CueColorField` so colour rows compose like every other field.
 *
 * @module form/ColorField
 */

import React from 'react';
import { CueColorField } from '../colorpicker/CueColorField';

export interface ColorFieldProps {
    value: string;
    onCommit: (value: string) => void;
    disabled?: boolean;
}

export const ColorField: React.FC<ColorFieldProps> = ({ value, onCommit, disabled }) => (
    <CueColorField value={value} onCommit={onCommit} disabled={disabled} />
);
