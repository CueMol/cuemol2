/**
 * @file components/dialogs/ErrorAlertDialog.tsx
 * @description Single-button modal for surfacing user-actionable errors
 * (e.g. "no compatible reader for this file") in a way the user must
 * acknowledge. Use `useShowErrorAlert({ title, message })` to display.
 */

import React from 'react';
import { Button } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';

export interface ErrorAlertDialogArgs {
    title: string;
    message: string;
}

interface Props {
    visible: boolean;
    title: string;
    message: string;
    onClose: () => void;
}

export function ErrorAlertDialog({ visible, title, message, onClose }: Props): React.JSX.Element {
    return (
        <DialogShell
            visible={visible}
            title={title}
            width="2xl"
            onCancel={onClose}
            // Acknowledge-only: one button, focused so Enter dismisses without
            // reaching for the mouse.
            footerActions={
                <Button intent="primary" onClick={onClose} autoFocus>OK</Button>
            }
        >
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                {message}
            </div>
        </DialogShell>
    );
}
