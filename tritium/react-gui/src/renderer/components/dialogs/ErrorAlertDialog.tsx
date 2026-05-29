/**
 * @file components/dialogs/ErrorAlertDialog.tsx
 * @description Single-button modal for surfacing user-actionable errors
 * (e.g. "no compatible reader for this file") in a way the user must
 * acknowledge. Use `useShowErrorAlert({ title, message })` to display.
 */

import React from 'react';
import { Dialog, DialogBody, DialogFooter, Button } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

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
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <Dialog
            isOpen={visible}
            onClose={onClose}
            title={title}
            style={{ width: 420 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
        >
            <DialogBody>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                    {message}
                </div>
            </DialogBody>
            <DialogFooter
                actions={<Button intent="primary" onClick={onClose} autoFocus>OK</Button>}
            />
        </Dialog>
    );
}
