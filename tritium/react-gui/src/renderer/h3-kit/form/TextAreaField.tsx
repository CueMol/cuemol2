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

/**
 * Which keystroke sends, following Slack's Enter-key preference.
 *
 * Slack offers exactly these two because neither suits everyone: Enter is
 * quicker for one-line chat, and a newline is safer for anything the user
 * composes over more than a few seconds.
 */
export type SubmitKey =
    /** Enter sends; Shift+Enter inserts a newline. */
    | 'enter'
    /** Enter inserts a newline; Cmd+Enter (macOS) or Ctrl+Enter sends. */
    | 'modifier-enter';

/** Whether this keystroke is the send gesture for `submitKey`. */
function isSubmitKey(e: React.KeyboardEvent, submitKey: SubmitKey): boolean {
    if (e.key !== 'Enter') return false;
    if (submitKey === 'enter') return !e.shiftKey && !e.ctrlKey && !e.metaKey;
    // Either modifier, rather than the platform's own: a user who learned the
    // other one gets what they meant, and neither has another meaning here.
    return e.metaKey || e.ctrlKey;
}

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
     * Called when the user asks to send. Which keystroke that is depends on
     * `submitKey`.
     *
     * Never fires for an Enter an input method is using, so the keystroke
     * that confirms a kana-to-kanji conversion (or any other IME candidate)
     * reaches the IME instead of sending a half-typed message. Bind this
     * rather than writing the Enter check in `onKeyDown`, which is where that
     * bug comes from.
     */
    onSubmit?: () => void;
    /**
     * Which keystroke sends. Defaults to `modifier-enter`, because in a field
     * that holds several lines a bare Enter belongs to the text: binding it
     * to send costs the user a half-written message every time they reach for
     * a new line.
     */
    submitKey?: SubmitKey;
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
    submitKey = 'modifier-enter',
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
            if (onSubmit && !isImeKey(e.nativeEvent) && isSubmitKey(e, submitKey)) {
                e.preventDefault();
                onSubmit();
                return;
            }
            onKeyDown?.(e);
        },
        [onSubmit, submitKey, onKeyDown],
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
