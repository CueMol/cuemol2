import { useCallback } from 'react'
import type { SceneCtxAction, SelectMolKind } from '../../shared/ipcTypes'
import { IPC } from '../../shared/ipcChannels'
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes'

/**
 * Opens the native scene-tree context menu and dispatches the returned
 * action against the appropriate worker service via the callbacks supplied
 * by `useSceneTree`. Mirrors the pattern in `useNaviContextMenu`.
 *
 * Phase 3a: Show / Hide, Rename (window.prompt-based), Delete, Properties.
 * Phase 3b: object Selection submenu (selectMol-* actions).
 */
export interface UseSceneContextMenuOptions {
    toggleVisibility: (id: string) => void
    deleteNode: (id: string) => Promise<boolean>
    renameNode: (id: string, newName: string) => Promise<boolean>
    showProperty: (id: string) => Promise<void> | void
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
}

export function useSceneContextMenu(opts: UseSceneContextMenuOptions): {
    openContextMenu: (node: SceneTreeNode, x: number, y: number) => Promise<void>
} {
    const { toggleVisibility, deleteNode, renameNode, showProperty, selectObjectMol } = opts

    const openContextMenu = useCallback(
        async (node: SceneTreeNode, x: number, y: number): Promise<void> => {
            const hasVisibility =
                node.type === 'object' ||
                node.type === 'renderer' ||
                node.type === 'rendGroup'

            const action: SceneCtxAction | null = await window.electronAPI.invoke(
                IPC.SCENE_CTX_SHOW,
                {
                    x,
                    y,
                    nodeType: node.type,
                    nodeLabel: nodeMenuLabel(node),
                    isVisible: node.visible,
                    hasVisibility,
                },
            )

            if (!action) return
            const idStr = String(node.id)

            switch (action.kind) {
                case 'show':
                case 'hide':
                    toggleVisibility(idStr)
                    break
                case 'rename': {
                    const next = window.prompt(`Rename ${node.name} to:`, node.name)
                    if (next == null) break
                    const trimmed = next.trim()
                    if (trimmed.length === 0 || trimmed === node.name) break
                    await renameNode(idStr, trimmed)
                    break
                }
                case 'delete':
                    await deleteNode(idStr)
                    break
                case 'property':
                    await showProperty(idStr)
                    break
                case 'selectMol':
                    if (node.type !== 'object') break
                    await selectObjectMol(idStr, action.selectKind)
                    break
            }
        },
        [toggleVisibility, deleteNode, renameNode, showProperty, selectObjectMol],
    )

    return { openContextMenu }
}

function nodeMenuLabel(node: SceneTreeNode): string {
    if (node.type === 'scene') return `Scene: ${node.name || 'Untitled'}`
    if (node.type === 'object') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    if (node.type === 'renderer') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    return node.name
}
