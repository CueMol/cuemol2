import React from 'react'
import {
    ApplyRendStyleDialog,
    type ApplyRendStyleAvailableEntry,
    type ApplyRendStyleDialogResult,
} from './ApplyRendStyleDialog'

// React import is required by the JSX runtime used at test time.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface ApplyRendStyleDialogArgs {
    rendName: string
    rendTypeName: string
    initialStyles: string[]
    typeMatch: ApplyRendStyleAvailableEntry[]
    edgeMatch: ApplyRendStyleAvailableEntry[]
    coloringMatch: ApplyRendStyleAvailableEntry[]
}

export const {
    Provider: ApplyRendStyleDialogProvider,
    useShow: useShowApplyRendStyleDialog,
} = createDialogHook<
    ApplyRendStyleDialogArgs,
    ApplyRendStyleDialogResult | null
>({
    name: 'ApplyRendStyleDialog',
    render: ({ visible, args, resolve }) => (
        <ApplyRendStyleDialog
            visible={visible}
            rendName={args?.rendName ?? ''}
            rendTypeName={args?.rendTypeName ?? ''}
            initialStyles={args?.initialStyles ?? []}
            typeMatch={args?.typeMatch ?? []}
            edgeMatch={args?.edgeMatch ?? []}
            coloringMatch={args?.coloringMatch ?? []}
            onConfirm={(r) => resolve(r)}
            onCancel={() => resolve(null)}
        />
    ),
})
