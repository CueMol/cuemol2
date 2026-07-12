/**
 * @file components/dialogs/DialogShell.tsx
 * @description Shared frame for the app's modal dialogs. It owns the
 * dialog-FRAME concerns that every dialog repeats verbatim:
 *   - theme-derived `portalClassName` (`'bp5-dark'` when dark, else `''` --
 *     NOT `undefined`, to match the pinned visual contract),
 *   - `canOutsideClickClose={false}` + `isCloseButtonShown={false}` (backdrop
 *     click + window chrome disabled; see `dialogOutsideClick.test.tsx`),
 *   - the `<div className="h3-dialog-form">` body wrapper (the single owner of
 *     inter-section gap) and the inline `.h3-dialog-error` message,
 *   - the Cancel / OK footer, and
 *   - the overall frame `width` (a dialog-frame concern, resolved to a
 *     `--dialog-w-*` token rung -- NOT control height or row gap, which stay
 *     owned by the form-kit tokens).
 *
 * It deliberately does NOT own the commit logic or per-dialog body content;
 * those stay in each dialog (see `hooks/useMolEditCommit.ts` for the commit
 * scaffold). Dialogs that need an extra portal sibling (e.g. a confirm
 * `Alert`) pass it via `extra`.
 */

import React from 'react'
import { Button, Dialog, DialogBody, DialogFooter, type Intent } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * Named rungs of the dialog-frame width ladder. Each maps to a
 * `--dialog-w-*` token in `styles/_variables.css`; consumers pick a rung
 * instead of an inline px value.
 */
export type DialogWidth =
    | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    | '2xl' | '3xl' | '4xl' | '5xl'

const WIDTH_VAR: Record<DialogWidth, string> = {
    xs: 'var(--dialog-w-xs)',
    sm: 'var(--dialog-w-sm)',
    md: 'var(--dialog-w-md)',
    lg: 'var(--dialog-w-lg)',
    xl: 'var(--dialog-w-xl)',
    '2xl': 'var(--dialog-w-2xl)',
    '3xl': 'var(--dialog-w-3xl)',
    '4xl': 'var(--dialog-w-4xl)',
    '5xl': 'var(--dialog-w-5xl)',
}

export interface DialogShellProps {
    /** Whether the modal is open (forwarded to `Dialog.isOpen`). */
    visible: boolean
    /** Title rendered as the inline heading. */
    title: string
    /** Frame width rung (-> `--dialog-w-*` token). Default `'lg'` (380px). */
    width?: DialogWidth
    /** Cancel handler (forwarded to `Dialog.onClose` and the Cancel button). */
    onCancel: () => void
    /** OK handler. Optional when {@link footerActions} replaces the footer. */
    onOk?: () => void
    /** OK button label. Default `'OK'`. */
    okLabel?: string
    /** OK button intent. Default `'primary'` (DeleteMol uses `'danger'`). */
    okIntent?: Intent
    /** Disables the OK button (validation gate). */
    okDisabled?: boolean
    /**
     * Commit-in-flight flag: shows the OK spinner and disables Cancel (and,
     * combined with `okDisabled`, the OK button).
     */
    submitting?: boolean
    /** Inline error message rendered as `.h3-dialog-error` (null = none). */
    errorMsg?: string | null
    /** Dialog body content (FieldSections / fields). */
    children: React.ReactNode
    /**
     * Replaces the default Cancel / OK footer buttons entirely (e.g. a
     * Start / Stop / Close set for a long-running job dialog). When provided,
     * `onOk` / `okLabel` / `okIntent` / `okDisabled` are ignored. The dialog
     * frame, body wrapper and error line stay shared.
     */
    footerActions?: React.ReactNode
    /**
     * Extra portal sibling rendered after the footer inside the Dialog (e.g. a
     * confirm `Alert` for the two Alert-gated molecule-edit dialogs).
     */
    extra?: React.ReactNode
}

/**
 * Renders the shared dialog frame around `children`.
 *
 * @remarks `isDark` is derived locally so consumers never thread theme state.
 * `portalClassName` keeps the `''` (not `undefined`) light-theme value the
 * outside-click test pins.
 */
export function DialogShell({
    visible,
    title,
    width = 'lg',
    onCancel,
    onOk,
    okLabel = 'OK',
    okIntent = 'primary',
    okDisabled = false,
    submitting = false,
    errorMsg = null,
    children,
    footerActions,
    extra,
}: DialogShellProps): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title={title}
            style={{ width: WIDTH_VAR[width] }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div className="h3-dialog-form">
                    {children}
                    {errorMsg !== null && errorMsg !== undefined && (
                        <div className="h3-dialog-error">{errorMsg}</div>
                    )}
                </div>
            </DialogBody>
            <DialogFooter
                actions={
                    footerActions ?? (
                        <>
                            <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
                            <Button
                                intent={okIntent}
                                onClick={onOk}
                                disabled={submitting || okDisabled}
                                loading={submitting}
                            >
                                {okLabel}
                            </Button>
                        </>
                    )
                }
            />
            {extra}
        </Dialog>
    )
}
