import React from 'react'
import {
    CreateRendStyleDialog,
    type CreateRendStyleDialogResult,
    type StyleSetOption,
} from './CreateRendStyleDialog'

// React import is required by the JSX runtime used at test time.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface CreateRendStyleDialogArgs {
    rendName: string
    rendTypeName: string
    styleSets: StyleSetOption[]
    defaultSelectedUid: number
}

export const {
    Provider: CreateRendStyleDialogProvider,
    useShow: useShowCreateRendStyleDialog,
} = createDialogHook<
    CreateRendStyleDialogArgs,
    CreateRendStyleDialogResult | null
>({
    name: 'CreateRendStyleDialog',
    render: ({ visible, args, resolve }) => (
        <CreateRendStyleDialog
            visible={visible}
            rendName={args?.rendName ?? ''}
            rendTypeName={args?.rendTypeName ?? ''}
            styleSets={args?.styleSets ?? []}
            defaultSelectedUid={args?.defaultSelectedUid ?? -1}
            onConfirm={(r) => resolve(r)}
            onCancel={() => resolve(null)}
        />
    ),
})
