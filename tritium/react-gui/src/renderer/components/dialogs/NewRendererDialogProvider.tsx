import React from 'react'
import { NewRendererDialog, type NewRendererDialogResult } from './NewRendererDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface NewRendererDialogArgs {
    sceneId: number
    objName: string
    objClassName: string
    rendererTypes: string[]
    defaultName: string
    isMol: boolean
    groupName?: string
}

export const {
    Provider: NewRendererDialogProvider,
    useShow: useShowNewRendererDialog,
} = createDialogHook<NewRendererDialogArgs, NewRendererDialogResult | null>({
    name: 'NewRendererDialog',
    render: ({ visible, args, resolve }) => (
        <NewRendererDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            objName={args?.objName ?? ''}
            objClassName={args?.objClassName ?? ''}
            rendererTypes={args?.rendererTypes ?? []}
            defaultName={args?.defaultName ?? ''}
            isMol={args?.isMol ?? false}
            groupName={args?.groupName}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
