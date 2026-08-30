import React from 'react'
import { NewRendererDialog, type NewRendererDialogResult } from './NewRendererDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'
import type { PresetTypeEntry } from '@renderer/dialogs/fopen-opt-dlgs/types'

export interface NewRendererDialogArgs {
    sceneId: number
    objName: string
    objClassName: string
    rendererTypes: string[]
    /** Renderer presets for the leading "Presets" optgroup. */
    presetTypes?: PresetTypeEntry[]
    defaultName: string
    isMol: boolean
    /** Target molecule uid -- forwarded to MolSelList for `current (<sel>)`. */
    molID?: number
    /** The target mol's current selection; non-empty defaults the checkbox on. */
    currentSel?: string
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
            presetTypes={args?.presetTypes ?? []}
            defaultName={args?.defaultName ?? ''}
            isMol={args?.isMol ?? false}
            molID={args?.molID}
            currentSel={args?.currentSel}
            groupName={args?.groupName}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
