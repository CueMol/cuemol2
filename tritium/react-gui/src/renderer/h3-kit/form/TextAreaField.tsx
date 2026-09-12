/**
 * @file h3-kit/form/TextAreaField.tsx
 * @description Canonical multi-line text input, auto-growing between a
 * minimum and a maximum number of rows.
 *
 * The multi-line counterpart of `TextField`: look, padding and font come from
 * `.h3-form-textarea` (see `styles/_form-kit.css`), and there is no size prop.
 * Height is the one dimension a consumer influences, and only in whole rows --
 * a chat composer wants to start at one line and stop growing at six, which
 * is a content decision rather than a size choice.
 *
 * @module form/TextAreaField
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { isImeKey } from './imeGuard';

export interface TextAreaFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    /** Render the value in the monospace face. */
    mono?: boolean;
    /** Rows shown when empty (default 1). */
    minRows?: number;
    /** Rows to grow to before scrolling (default 6). */
    maxRows?: number;
    /**
     * Send on Enter, newline on Shift+Enter -- the chat-composer convention.
     *
     * Held off while an input method is composing, so the Enter that confirms
     * a kana-to-kanji conversion (or any other IME candidate) reaches the IME
     * instead of sending a half-typed message. Bind this rather than writing
     * the Enter check in `onKeyDown`, which is where that bug comes from.
     */
    onSubmit?: () => void;
    /** Other keys. Not called for an Enter that `onSubmit` consumed. */
    onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
    onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
    /** Focus on mount. */
    autoFocus?: boolean;
    /** Accessible name, when no visible label is attached. */
    ariaLabel?: string;
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({
    value,
    onChange,
    placeholder,
    disabled,
    readOnly,
    mono,
    minRows = 1,
    maxRows = 6,
    onSubmit,
    onKeyDown,
    onBlur,
    autoFocus,
    ariaLabel,
}) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    // Measure from the element's own line-height rather than a hard-coded
    // number, so the growth steps follow whatever the tokens say a row is.
    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const styles = window.getComputedStyle(el);
        const lineHeight = parseFloat(styles.lineHeight) || 16;
        const vertPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
        const border = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
        const min = lineHeight * minRows + vertPadding + border;
        const max = lineHeight * maxRows + vertPadding + border;
        // Collapse first: scrollHeight only shrinks once the box is smaller
        // than its content, so a shortened value would otherwise keep the
        // height it grew to.
        el.style.height = 'auto';
        const wanted = el.scrollHeight + border;
        const next = Math.min(Math.max(wanted, min), max);
        el.style.height = `${next}px`;
        el.style.overflowY = wanted > max ? 'auto' : 'hidden';
    }, [minRows, maxRows]);

    useLayoutEffect(() => { resize(); }, [value, resize]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (onSubmit && e.key === 'Enter' && !e.shiftKey && !isImeKey(e.nativeEvent)) {
                e.preventDefault();
                onSubmit();
                return;
            }
            onKeyDown?.(e);
        },
        [onSubmit, onKeyDown],
    );

    return (
        <textarea
            ref={ref}
            className={`h3-form-textarea${mono ? ' h3-form-textarea-mono' : ''}`}
            value={value}
            onChange={(e) => { onChange(e.target.value); }}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            onKeyDown={handleKeyDown}
            onBlur={onBlur}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            rows={minRows}
        />
    );
};
