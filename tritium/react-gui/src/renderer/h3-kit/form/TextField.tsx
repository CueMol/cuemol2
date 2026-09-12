/**
 * @file h3-kit/form/TextField.tsx
 * @description Canonical single-line text input. Height/border/focus come from
 * `.h3-form-input` (see `styles/_form-kit.css`); no size prop is exposed.
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
    /** Render the value in the monospace face (e.g. a code / selection expression). */
    mono?: boolean;
    /**
     * Mask the value (an API key or other credential). Size and look are
     * unchanged; only the input type differs.
     */
    password?: boolean;
    /** Leading icon (Blueprint icon name or element), e.g. a filter/search glyph. */
    leftIcon?: React.ComponentProps<typeof InputGroup>['leftIcon'];
    /** Trailing element rendered inside the input's right edge (e.g. a clear or dropdown-trigger button). */
    rightElement?: React.ReactNode;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    /** Focus the input on mount (e.g. a cell that just entered edit mode). */
    autoFocus?: boolean;
    /** Fired on blur -- used to commit a draft value (e.g. live-apply on focus loss). */
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export const TextField: React.FC<TextFieldProps> = ({
    value,
    onChange,
    placeholder,
    disabled,
    readOnly,
    invalid,
    fill = true,
    mono,
    password,
    leftIcon,
    rightElement,
    onKeyDown,
    onBlur,
    autoFocus,
}) => (
    <InputGroup
        small
        className={`h3-form-input${mono ? ' h3-form-input-mono' : ''}`}
        type={password ? 'password' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        fill={fill}
        leftIcon={leftIcon}
        rightElement={rightElement as React.ReactElement | undefined}
        intent={invalid ? Intent.DANGER : Intent.NONE}
        aria-invalid={invalid || undefined}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        autoFocus={autoFocus}
    />
);
