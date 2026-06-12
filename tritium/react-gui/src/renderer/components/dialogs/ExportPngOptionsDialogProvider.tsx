import React from 'react'
import {
    ExportPngOptionsDialog,
    type ExportPngOptionsResult,
} from './ExportPngOptionsDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface ExportPngOptionsDialogArgs {
    initialWidth: number
    initialHeight: number
}

export const {
    Provider: ExportPngOptionsDialogProvider,
    useShow: useShowExportPngOptionsDialog,
} = createDialogHook<
    ExportPngOptionsDialogArgs,
    ExportPngOptionsResult | null
>({
    name: 'ExportPngOptionsDialog',
    render: ({ visible, args, resolve }) => (
        <ExportPngOptionsDialog
            visible={visible}
            initialWidth={args?.initialWidth ?? 1024}
            initialHeight={args?.initialHeight ?? 768}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
