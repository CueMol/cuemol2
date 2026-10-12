/**
 * @file h3-kit/list/TruncatedText.tsx
 * @description One line of text that ellipsizes in its row and, when it is
 * cut, shows the whole line on hover as an in-place expansion: the full text
 * drawn over the cut one, in the same font and at the same position, so the
 * label looks as if it simply grew past the row. This is how macOS table and
 * outline views (Finder, Mail) and the Windows list view show a truncated
 * item, and it suits a list row better than a tooltip bubble: a bubble placed
 * beside the label points at where the uncut text would end, which is
 * outside the row, and one placed below it covers the next row.
 *
 * - Shown only when the text is cut (`scrollWidth > clientWidth`), after a
 *   short hover, and hidden on leave, press, scroll or wheel.
 * - The overlay takes no pointer events, so clicks and double-clicks still
 *   reach the row beneath it.
 * - Font and colour are copied from the label so the glyphs line up; the
 *   overlay's own box (background, border, inset) is `_list-kit.css`
 *   `.h3-expansion-tip`.
 *
 * @module list/TruncatedText
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Hover time before the expansion shows. */
const SHOW_DELAY_MS = 400;

export interface TruncatedTextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
    /** The line. */
    text: string;
}

interface TipBox {
    left: number;
    top: number;
    height: number;
    font: string;
    color: string;
    letterSpacing: string;
}

/** The label's box and type, read when the expansion opens. */
function tipBoxOf(el: HTMLElement): TipBox {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: r.left, top: r.top, height: r.height, font: cs.font, color: cs.color, letterSpacing: cs.letterSpacing };
}

/**
 * A single-line label that ellipsizes, with an in-place expansion on hover
 * when it is cut.
 */
export const TruncatedText: React.FC<TruncatedTextProps> = ({ text, className, onMouseEnter, onMouseLeave, ...rest }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const timer = useRef<number | null>(null);
    const [box, setBox] = useState<TipBox | null>(null);

    const cancel = useCallback(() => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
    }, []);
    const hide = useCallback(() => {
        cancel();
        setBox(null);
    }, [cancel]);

    const handleEnter = useCallback(
        (e: React.MouseEvent<HTMLSpanElement>) => {
            onMouseEnter?.(e);
            cancel();
            timer.current = window.setTimeout(() => {
                timer.current = null;
                const el = ref.current;
                if (el && el.scrollWidth > el.clientWidth) setBox(tipBoxOf(el));
            }, SHOW_DELAY_MS);
        },
        [onMouseEnter, cancel],
    );
    const handleLeave = useCallback(
        (e: React.MouseEvent<HTMLSpanElement>) => {
            onMouseLeave?.(e);
            hide();
        },
        [onMouseLeave, hide],
    );

    // Anything that moves or acts on the row drops the expansion: it is drawn
    // at a fixed place and would otherwise float off the label.
    useEffect(() => {
        if (!box) return;
        const opts = { capture: true, passive: true } as const;
        window.addEventListener('scroll', hide, opts);
        window.addEventListener('wheel', hide, opts);
        window.addEventListener('mousedown', hide, opts);
        window.addEventListener('blur', hide);
        return () => {
            window.removeEventListener('scroll', hide, opts);
            window.removeEventListener('wheel', hide, opts);
            window.removeEventListener('mousedown', hide, opts);
            window.removeEventListener('blur', hide);
        };
    }, [box, hide]);

    useEffect(() => cancel, [cancel]);

    return (
        <>
            <span
                ref={ref}
                className={`h3-truncated-text${className ? ` ${className}` : ''}`}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                {...rest}
            >
                {text}
            </span>
            {box &&
                createPortal(
                    <div
                        className="h3-expansion-tip"
                        role="tooltip"
                        style={{
                            // `font` first: the shorthand resets line-height.
                            font: box.font,
                            letterSpacing: box.letterSpacing,
                            color: box.color,
                            left: box.left,
                            top: box.top,
                            height: box.height,
                            lineHeight: `${box.height}px`,
                        }}
                    >
                        {text}
                    </div>,
                    document.body,
                )}
        </>
    );
};
