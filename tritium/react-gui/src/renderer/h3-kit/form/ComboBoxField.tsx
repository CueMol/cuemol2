/**
 * @file h3-kit/form/ComboBoxField.tsx
 * @description Canonical editable combobox: a text input with a click-to-open
 * dropdown of suggestions (e.g. an input history). Height / border come from
 * the shared `.h3-form-input`; the dropdown chevron is positioned identically
 * to SelectField's native-select caret via `.h3-form-combobox`
 * (styles/_form-kit.css), the single source for combobox sizing -- so a
 * chevron-equipped textbox never needs per-use position tweaking. No size prop
 * is exposed.
 *
 * Why a Blueprint Popover and not a native combobox: HTML's only native
 * editable combobox is `<input list=datalist>`, whose dropdown is OS-drawn --
 * it ignores the app theme (always light), can open on focus / typing, and its
 * chevron does not line up with the input. A Blueprint Popover is themeable
 * (portalClassName) and controlled (opens only from the chevron), so it is the
 * right primitive here. SelectField stays a native `<select>` because it is
 * non-editable and the native list popup has none of those problems.
 *
 * @module form/ComboBoxField
 */

import React, { useState } from 'react';
import { InputGroup, Intent, Menu, MenuItem, Popover } from '@blueprintjs/core';
import { useDarkPortalClass } from '@renderer/h3-kit/primitives';

export interface ComboBoxFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** Dropdown suggestions (e.g. recent inputs), newest-first. */
    options: string[];
    /**
     * Called when an option is chosen from the dropdown. Defaults to `onChange`;
     * override when picking should do more than set the value.
     */
    onPick?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Show the danger intent (e.g. failed validation). */
    invalid?: boolean;
    /** Fill the available width (default true). */
    fill?: boolean;
    /** Text shown in the dropdown when `options` is empty. */
    emptyText?: string;
    /** Accessible label for the dropdown trigger (the chevron). */
    triggerLabel?: string;
    /** Tooltip for the dropdown trigger. */
    triggerTitle?: string;
    /** Fired just before the dropdown opens -- e.g. to refresh `options`. */
    onOpen?: () => void;
    autoFocus?: boolean;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    id?: string;
    'aria-label'?: string;
}

export const ComboBoxField: React.FC<ComboBoxFieldProps> = ({
    value,
    onChange,
    options,
    onPick,
    placeholder,
    disabled,
    invalid,
    fill = true,
    emptyText = 'No items',
    triggerLabel = 'Show suggestions',
    triggerTitle,
    onOpen,
    autoFocus,
    onKeyDown,
    id,
    ...rest
}) => {
    const portalClassName = useDarkPortalClass();
    const [open, setOpen] = useState(false);
    const hasOptions = options.length > 0;

    const pick = (v: string): void => {
        (onPick ?? onChange)(v);
        setOpen(false);
    };

    return (
        <div className={`h3-form-combobox${fill ? ' h3-form-combobox-fill' : ''}`}>
            <InputGroup
                small
                id={id}
                className="h3-form-input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                fill={fill}
                autoFocus={autoFocus}
                intent={invalid ? Intent.DANGER : Intent.NONE}
                aria-invalid={invalid || undefined}
                aria-label={rest['aria-label']}
                // The dropdown below is the only history affordance; suppress the
                // browser's own (non-themed, auto-opening) autocomplete popup.
                autoComplete="off"
            />
            <Popover
                isOpen={open}
                // Controlled so the list never opens by itself; refresh the
                // options right before it opens.
                onInteraction={(next) => {
                    if (next) onOpen?.();
                    setOpen(next);
                }}
                placement="bottom-end"
                portalClassName={portalClassName}
                disabled={disabled || !hasOptions}
                content={
                    <Menu className="h3-form-combobox-menu">
                        {hasOptions ? (
                            options.map((opt, i) => (
                                <MenuItem
                                    key={`${opt}-${i}`}
                                    text={opt}
                                    active={opt === value}
                                    onClick={() => pick(opt)}
                                />
                            ))
                        ) : (
                            <MenuItem disabled text={emptyText} />
                        )}
                    </Menu>
                }
                renderTarget={({ isOpen: _isOpen, ref, ...targetProps }) => (
                    <button
                        {...targetProps}
                        ref={ref}
                        type="button"
                        className="h3-form-combobox-caret"
                        disabled={disabled || !hasOptions}
                        aria-label={triggerLabel}
                        title={triggerTitle}
                    >
                        <span className="h3-form-caret" aria-hidden />
                    </button>
                )}
            />
        </div>
    );
};
