/**
 * @file h3-kit/list/TruncatedText.tsx
 * @description One line of text that ellipsizes in its row and, when it is
 * cut, shows the whole line on hover in the app's tooltip -- the same bubble
 * as the toolbar buttons, to the right of the label (a long line centred
 * below a row near the left edge of the window would run off it).
 *
 * - The label itself is the tooltip's target, and it is the element that
 *   ellipsizes, so the bubble is placed against the part of the text that
 *   is on screen. (Wrapping a label whose parent does the cutting placed it
 *   against the uncut text's width, which ends outside the row.)
 * - The tooltip is on only while the text is cut (`scrollWidth >
 *   clientWidth`), re-measured whenever the label is resized or its text
 *   changes, so a label that fits shows nothing.
 *
 * @module list/TruncatedText
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Tooltip } from '@renderer/h3-kit/primitives';

export interface TruncatedTextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
    /** The line. */
    text: string;
    /**
     * More to say about the row (a description, why it is unavailable),
     * shown in the same tooltip whether or not the text is cut.
     */
    hint?: string;
}

/** Set a React ref of either kind. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
    if (typeof ref === 'function') ref(value);
    else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
}

/**
 * A single-line label that ellipsizes, with a tooltip of the whole line
 * while it is cut.
 */
export const TruncatedText: React.FC<TruncatedTextProps> = ({ text, hint, className, ...rest }) => {
    const el = useRef<HTMLSpanElement | null>(null);
    const [cut, setCut] = useState(false);

    const measure = useCallback(() => {
        const node = el.current;
        setCut(!!node && node.scrollWidth > node.clientWidth);
    }, []);

    useLayoutEffect(() => {
        measure();
        const node = el.current;
        if (!node || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(node);
        return () => ro.disconnect();
    }, [text, measure]);

    return (
        <Tooltip
            content={
                hint ? (
                    <div className="h3-truncated-tip">
                        {cut && <div>{text}</div>}
                        <div>{hint}</div>
                    </div>
                ) : cut ? text : ''
            }
            // Right of the label, growing rightward: a long line centred
            // below a row near the left edge would run off the window.
            placement="right"
            renderTarget={({ isOpen: _isOpen, ref, ...targetProps }) => (
                <span
                    {...rest}
                    {...targetProps}
                    ref={(node: HTMLSpanElement | null) => {
                        el.current = node;
                        assignRef(ref as React.Ref<HTMLSpanElement>, node);
                    }}
                    className={`h3-truncated-text${className ? ` ${className}` : ''}${targetProps.className ? ` ${targetProps.className}` : ''}`}
                >
                    {text}
                </span>
            )}
        />
    );
};
