/**
 * @file h3-kit/Tooltip.tsx
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
 * @module Tooltip
 */

import React from 'react';
import { Tooltip as BpTooltip, type TooltipProps as BpTooltipProps } from '@blueprintjs/core';

export interface TooltipProps {
    /** Tooltip body. When empty/nullish the tooltip is disabled (no empty bubble). */
    content: BpTooltipProps['content'];
    /** The target element the tooltip describes (single child). */
    children: React.ReactElement;
    /** Placement relative to the target (default `bottom`). */
    placement?: BpTooltipProps['placement'];
    /** Force-disable the tooltip. */
    disabled?: boolean;
    className?: string;
}

const isEmptyContent = (content: BpTooltipProps['content']): boolean =>
    content == null || content === '';

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    placement = 'bottom',
    disabled,
    className,
}) => (
    <BpTooltip
        content={content}
        placement={placement}
        compact
        disabled={disabled || isEmptyContent(content)}
        className={className}
    >
        {children}
    </BpTooltip>
);
