/**
 * @file h3-kit/form/PropertyField.tsx
 * @description `Field` plus the property-inspector decorations: a left
 * "modified" indicator bar and a hover-only per-property reset button. The
 * default value (what reset restores) is surfaced in the reset button's hover
 * tooltip rather than as an inline label.
 *
 * `Field` is deliberately minimal, so these inspector-specific affordances live
 * in this wrapper instead of bloating the canonical row primitive. Like the
 * rest of the form-kit, it exposes NO size props: bar width, row padding, label
 * gap and control height all come from the `--field-*` / `--prop-*` tokens in
 * `_variables.css` and the `.h3-form-prop-*` / `.h3-form-field-*` classes in
 * `styles/_form-kit.css`. Pair it with a form-kit control as children.
 *
 * @module form/PropertyField
 */

import React from 'react';
import { Button, Tooltip } from '@blueprintjs/core';
import { AppIcon } from '../../components/AppIcon';

export interface PropertyFieldProps {
    /** Label shown above (stack) or beside (inline) the control. */
    label: string;
    /** Render label and control on one line (e.g. for a SwitchField). */
    inline?: boolean;
    /**
     * The property differs from its default. Drives the indicator bar + row
     * wash and is the only state in which the reset button is revealed.
     */
    modified?: boolean;
    /**
     * The property exposes a resettable default at all. The reset button is
     * rendered when true (and only revealed on hover while `modified`).
     */
    resettable?: boolean;
    /**
     * Pre-formatted default value (e.g. "on" / "1.00"). When present, shown in
     * the reset button's hover tooltip so the user sees what reset restores.
     */
    defaultValueLabel?: string;
    /** Reset just this property to its default. Called only when modified. */
    onReset?: () => void;
    /**
     * Layout-only class for positioning the row within its parent. Must NOT be
     * used to set sizes -- sizing lives in the kit.
     */
    className?: string;
    children: React.ReactNode;
}

/**
 * A labeled control row with a per-property modified indicator and reset.
 *
 * @remarks The reset button is only enabled/handled while `modified` is true;
 * the CSS reveals it on hover only for a modified row, so a property sitting at
 * its default never shows a reset affordance.
 */
export const PropertyField: React.FC<PropertyFieldProps> = ({
    label,
    inline,
    modified,
    resettable,
    defaultValueLabel,
    onReset,
    className,
    children,
}) => {
    const rowClass =
        'h3-form-prop-row' +
        (modified ? ' is-modified' : '') +
        (inline ? ' h3-form-inline' : '') +
        (className ? ` ${className}` : '');

    return (
        <div className={rowClass}>
            <span className="h3-form-prop-bar" aria-hidden="true" />
            <div className="h3-form-prop-head">
                <label className="h3-form-field-label">{label}</label>
                {resettable && onReset && (
                    <Tooltip
                        content={
                            defaultValueLabel !== undefined
                                ? `Reset to default (${defaultValueLabel})`
                                : 'Reset to default'
                        }
                        placement="top"
                        compact
                    >
                        <Button
                            className="h3-form-prop-reset"
                            minimal
                            small
                            icon={<AppIcon name="ui.resetDefaults" aria-hidden />}
                            aria-label={
                                defaultValueLabel !== undefined
                                    ? `Reset to default (${defaultValueLabel})`
                                    : 'Reset to default'
                            }
                            disabled={!modified}
                            onClick={() => modified && onReset()}
                        />
                    </Tooltip>
                )}
            </div>
            <div className="h3-form-field-control">{children}</div>
        </div>
    );
};
