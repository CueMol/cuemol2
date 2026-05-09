import React from 'react';
import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    ProgressBar,
} from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

export type StreamProgressStatus = 'downloading' | 'canceling';

interface Props {
    visible: boolean;
    title: string;
    bytesReceived: number;
    status: StreamProgressStatus;
    onCancel: () => void;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} bytes`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function StreamProgressDialog({
    visible, title, bytesReceived, status, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <Dialog
            isOpen={visible}
            title={title}
            style={{ width: 320 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canEscapeKeyClose={false}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <ProgressBar intent="primary" />
                <div style={{ marginTop: 8, color: 'var(--pt-text-color-muted)' }}>
                    {status === 'canceling'
                        ? 'Canceling…'
                        : `Read ${formatBytes(bytesReceived)}`}
                </div>
            </DialogBody>
            <DialogFooter
                actions={
                    <Button onClick={onCancel} disabled={status === 'canceling'}>
                        Cancel
                    </Button>
                }
            />
        </Dialog>
    );
}
