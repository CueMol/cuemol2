/**
 * @file features/actions/libraryOps.ts
 * @description What the Action library pane and its commands share: where
 * the files are, the worker calls, a change signal so the pane re-reads the
 * folder after a save / copy / rename / delete, and which objects a macro
 * runs on.
 */

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { LibraryFile } from '@renderer/worker/shared/actionLibraryTypes'

/** The shipped preset file and the user's folder, from main. */
export interface LibraryPaths {
    bundledFile: string
    userDir: string
}

let pathsPromise: Promise<LibraryPaths> | null = null

/** Where the library lives; asked of main once. */
export function libraryPaths(): Promise<LibraryPaths> {
    pathsPromise ??= window.electronAPI
        .invoke(IPC.APP_PATH)
        .then((info) => ({ bundledFile: info.bundledActionsFile, userDir: info.actionsDir }))
    return pathsPromise
}

// --- change signal ---

const listeners = new Set<() => void>()

/** Re-read the library wherever it is shown. */
export function notifyLibraryChanged(): void {
    for (const fn of listeners) fn()
}

export function onLibraryChanged(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

// --- worker calls ---

/** Every library file, the shipped one first. */
export async function listLibrary(cm: AsyncCueMol | null): Promise<LibraryFile[]> {
    if (!cm) return []
    const paths = await libraryPaths()
    const res = await cm.invokeService('listActionLibrary', paths)
    return res.ok ? res.files : []
}

/** Whether a path is in the user's folder (only those may be renamed or deleted). */
export function isUserFile(paths: LibraryPaths, file: string): boolean {
    return file.startsWith(paths.userDir)
}

// --- targets ---

/** The parent chain of `id` in the tree, nearest first. */
function ancestors(root: SceneTreeNode, id: number): SceneTreeNode[] {
    const walk = (node: SceneTreeNode, path: SceneTreeNode[]): SceneTreeNode[] | null => {
        if (node.id === id) return path
        for (const c of node.children ?? []) {
            const hit = walk(c, [node, ...path])
            if (hit) return hit
        }
        return null
    }
    return walk(root, []) ?? []
}

/** The object a tree node belongs to (itself for an object); null for anything else. */
function objectOf(root: SceneTreeNode, id: number): SceneTreeNode | null {
    const find = (node: SceneTreeNode): SceneTreeNode | null => {
        if (node.id === id) return node
        for (const c of node.children ?? []) {
            const hit = find(c)
            if (hit) return hit
        }
        return null
    }
    const node = find(root)
    if (!node) return null
    if (node.type === 'object') return node
    if (node.type !== 'renderer' && node.type !== 'rendGroup') return null
    return ancestors(root, id).find((n) => n.type === 'object') ?? null
}

/** All objects of the scene. */
function objectsOf(root: SceneTreeNode): SceneTreeNode[] {
    const out: SceneTreeNode[] = []
    const walk = (node: SceneTreeNode): void => {
        if (node.type === 'object') out.push(node)
        for (const c of node.children ?? []) walk(c)
    }
    walk(root)
    return out
}

/**
 * The objects a macro of one target runs on: those selected in the scene
 * tree (a selected renderer counts as its object), else the scene's only
 * object. Whether each is of the class the macro takes is the worker's
 * check, when it runs.
 */
export function libraryTargets(
    tree: SceneTreeNode | null,
    selectedIds: ReadonlySet<string>,
): { id: number; name: string }[] {
    if (!tree) return []
    const seen = new Map<number, string>()
    for (const sid of selectedIds) {
        const obj = objectOf(tree, Number(sid))
        if (obj) seen.set(obj.id, obj.name)
    }
    if (seen.size === 0) {
        const all = objectsOf(tree)
        if (all.length === 1) seen.set(all[0].id, all[0].name)
    }
    return [...seen].map(([id, name]) => ({ id, name }))
}
