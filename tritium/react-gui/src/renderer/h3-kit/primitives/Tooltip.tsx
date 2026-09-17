/**
 * @file h3-kit/primitives/Tooltip.tsx
 * @description Canonical hover tooltip -- a thin wrapper over Blueprint's
 * Tooltip locked to one app-wide shape (compact, bottom placement). Use this
 * everywhere a control needs a tooltip so they all look identical.
 *
 * Prefer this over a native `title` attribute: Electron suppresses native
 * titles over `-webkit-app-region: drag` regions, and a native title never
 * shows on a disabled control (many toolbar/action buttons are disabled until
 * some precondition is met). The Blueprint tooltip renders in a portal and
 * shows on hover of the wrapper span, so it works in both cases.
 *
 * Hover is the ONLY trigger: Blueprint also opens a tooltip when its target
 * takes focus (`openOnTargetFocus`, default true), which made a tooltip pop up
 * with the pointer nowhere near the button. A toolbar button that opens a
 * dialog gets the focus back when the dialog closes, and the tooltip then
 * appeared over the pane on its own -- reported for the Camera pane's New
 * button and the scene tree's Add button, but it applied to every tooltipped
 * control that opens a dialog. Turning it off also drops the `tabindex="0"`
 * Blueprint puts on the wrapper span, so these spans stop being tab stops of
 * their own; the button inside is what the keyboard should land on.
 *
 * @module Tooltip
 */

import React from 'react';
import { Tooltip as BpTooltip, type TooltipProps as BpTooltipProps } from '@blueprintjs/core';

export interface TooltipProps {
    /** Tooltip body. When empty/nullish the tooltip is disabled (no empty bubble). */
    content: BpTooltipProps['content'];
    /** The target element the tooltip describes (single child). Omit when using `renderTarget`. */
    children?: React.ReactElement;
    /** Placement relative to the target (default `bottom`). */
    placement?: BpTooltipProps['placement'];
    /** Force-disable the tooltip. */
    disabled?: boolean;
    className?: string;
    /**
     * Full control over the target via Blueprint's render-prop API. Use instead
     * of `children` when the target is custom-positioned (e.g. an absolutely
     * placed timeline segment) and so cannot be wrapped in the default target
     * span -- spread the injected handlers + `ref` onto your own element.
     */
    renderTarget?: BpTooltipProps['renderTarget'];
}

const isEmptyContent = (content: BpTooltipProps['content']): boolean =>
    content == null || content === '';

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    placement = 'bottom',
    disabled,
    className,
    renderTarget,
}) => (
    <BpTooltip
        content={content}
        placement={placement}
        compact
        openOnTargetFocus={false}
        disabled={disabled || isEmptyContent(content)}
        className={className}
        renderTarget={renderTarget}
    >
        {children}
    </BpTooltip>
);
