import React from 'react'
import { QscWriterOptionDialog, type QscWriterOptions } from './QscWriterOptionDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export const { Provider: QscWriterOptionDialogProvider, useShow: useShowQscWriterOptionDialog } =
    createDialogHook<void, QscWriterOptions | null>({
        name: 'QscWriterOptionDialog',
        render: ({ visible, resolve }) => (
            <QscWriterOptionDialog
                visible={visible}
                onConfirm={(result) => resolve(result)}
                onCancel={() => resolve(null)}
            />
        ),
    })
