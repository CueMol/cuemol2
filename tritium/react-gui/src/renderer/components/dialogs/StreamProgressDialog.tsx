import React from 'react';
import { Button, ProgressBar } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';

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
    return (
        <DialogShell
            visible={visible}
            title={title}
            width="sm"
            onCancel={onCancel}
            // A download in flight has to be stopped, not dismissed: Escape
            // would leave the transfer running behind a closed dialog.
            canEscapeKeyClose={false}
            footerActions={
                <Button onClick={onCancel} disabled={status === 'canceling'}>
                    Cancel
                </Button>
            }
        >
            <ProgressBar intent="primary" />
            <div style={{ color: 'var(--text-secondary)' }}>
                {status === 'canceling'
                    ? 'Canceling\u2026'
                    : `Read ${formatBytes(bytesReceived)}`}
            </div>
        </DialogShell>
    );
}
