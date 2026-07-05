/**
 * @file h3-kit/form/ColorField.tsx
 * @description Canonical colour editor -- a thin catalog alias over
 * `CueColorField` so colour rows compose like every other field.
 *
 * @module form/ColorField
 */

import React from 'react';
import { CueColorField } from '../colorpicker/CueColorField';
import type { Mode } from '../colorpicker/ColorPicker';

export interface ColorFieldProps {
    value: string;
    onCommit: (value: string) => void;
    disabled?: boolean;
    /**
     * Restrict the picker's mode segments (see `ColorPicker.modes`). Use e.g.
     * `['rgb','hsb','palette']` in scene-independent contexts where the
     * scene-scoped Named / Mol modes make no sense.
     */
    modes?: Mode[];
    className?: string;
}

export const ColorField: React.FC<ColorFieldProps> = ({
    value,
    onCommit,
    disabled,
    modes,
    className,
}) => (
    <CueColorField
        value={value}
        onCommit={onCommit}
        disabled={disabled}
        modes={modes}
        className={className}
    />
);
