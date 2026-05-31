/**
 * @file components/widgets/form/TextField.tsx
 * @description Canonical single-line text input. Height/border/focus come from
 * `.fk-input` (see `styles/_form-kit.css`); no size prop is exposed.
 *
 * @module form/TextField
 */

import React from 'react';
import { InputGroup, Intent } from '@blueprintjs/core';

export interface TextFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    /** Show the danger intent (e.g. failed validation). */
    invalid?: boolean;
    /** Fill the available width (default true). */
    fill?: boolean;
    /** Leading icon (Blueprint icon name or element), e.g. a filter/search glyph. */
    leftIcon?: React.ComponentProps<typeof InputGroup>['leftIcon'];
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const TextField: React.FC<TextFieldProps> = ({
    value,
    onChange,
    placeholder,
    disabled,
    readOnly,
    invalid,
    fill = true,
    leftIcon,
    onKeyDown,
}) => (
    <InputGroup
        small
        className="fk-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        fill={fill}
        leftIcon={leftIcon}
        intent={invalid ? Intent.DANGER : Intent.NONE}
        aria-invalid={invalid || undefined}
        onKeyDown={onKeyDown}
    />
);
