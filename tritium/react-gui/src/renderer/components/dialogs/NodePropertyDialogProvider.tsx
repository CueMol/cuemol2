/*
 * @deprecated Superseded by the generic property inspector. No longer mounted
 * in `DialogContext`; scheduled for deletion together with `NodePropertyDialog`,
 * the `getNodeInfo` worker service and the `fetchNodeInfo` scene-tree helper.
 */
import React from 'react'
import { NodePropertyDialog } from './NodePropertyDialog'
import { createDialogHook } from '../../hooks/useDialogFactory'
import type { NodeInfoEntry } from '../../worker/server/services/sceneOps.service'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface NodePropertyDialogArgs {
    title: string
    entries: NodeInfoEntry[]
}

export const {
    Provider: NodePropertyDialogProvider,
    useShow: useShowNodePropertyDialog,
} = createDialogHook<NodePropertyDialogArgs, void>({
    name: 'NodePropertyDialog',
    render: ({ visible, args, resolve }) => (
        <NodePropertyDialog
            visible={visible}
            title={args?.title ?? ''}
            entries={args?.entries ?? []}
            onClose={() => resolve()}
        />
    ),
})
