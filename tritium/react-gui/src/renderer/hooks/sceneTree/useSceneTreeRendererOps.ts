/**
 * @file hooks/sceneTree/useSceneTreeRendererOps.ts
 * @description Renderer-targeted scene-tree operations for `useSceneTree`:
 * coloring, paint, style, change-selection, surf-obj generation, group
 * creation, type change, and renderer creation on an object.
 */

import { useCallback, type MutableRefObject } from 'react'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'
import type { ChangeRendSelKind, RendColoringId } from '@shared/types/sceneCtxMenu'
import type { RendererOptions } from '../../components/fopen-opt-dlgs/types'
import { findTypedNode } from './sceneTreeNodeUtils'

export interface SceneTreeRendererOps {
    /** Apply a static coloring submenu choice to a renderer. */
    setRendererColoring: (id: string, coloringId: RendColoringId) => Promise<boolean>
    /** Insert a paint entry (color + current mol sel) into a PaintColoring renderer. */
    paintRendererSelection: (id: string, colorValue: string) => Promise<boolean>
    /** Object-level paint: insert a paint entry into a MolCoord's coloring. */
    paintObjectSelection: (id: string, colorValue: string) => Promise<boolean>
    /** Apply a Style (shape) submenu choice. */
    applyRendererStyle: (
        id: string,
        styleName: string,
        pattern: string,
        flags: string,
    ) => Promise<boolean>
    /** Apply a "Change sel" submenu choice to a renderer. */
    setRendererSelection: (id: string, selKind: ChangeRendSelKind) => Promise<boolean>
    /** Generate a MolSurfObj from an isosurf renderer. */
    generateRendererSurfObj: (id: string) => Promise<boolean>
    /**
     * Create an empty `*group` renderer under the given object. The
     * caller passes the user-confirmed name (the renderer side prompts
     * with a worker-suggested default); pass an empty string to let the
     * worker auto-generate `groupN`.
     */
    createRendererGroup: (objId: string, name: string) => Promise<boolean>
    /** Replace a renderer with a new type. */
    changeRendererType: (rendId: string, newType: string) => Promise<boolean>
    /**
     * Create a new renderer on the given object.
     * Mirrors UXP `Qm2Main.setupRendByObjID`. Returns true on success;
     * the tree refresh happens via the event listener.
     */
    createRendererOnObject: (
        targetObjId: number,
        rendOpts: RendererOptions,
        groupName?: string,
    ) => Promise<boolean>
}

export function useSceneTreeRendererOps(
    cm: AsyncCueMol | null,
    sceneIdRef: MutableRefObject<number | undefined>,
    tree: SceneTreeNode | null,
): SceneTreeRendererOps {
    const setRendererColoring = useCallback(
        async (id: string, coloringId: RendColoringId): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'renderer')
            if (!found) return false
            const res = await cm.invokeService('setRendererColoring', {
                sceneId: sid,
                rendId: found.numId,
                coloringId,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const paintRendererSelection = useCallback(
        async (id: string, colorValue: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'renderer')
            if (!found) return false
            const res = await cm.invokeService('paintRendererSelection', {
                sceneId: sid,
                rendId: found.numId,
                colorValue,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const paintObjectSelection = useCallback(
        async (id: string, colorValue: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'object')
            if (!found) return false
            const res = await cm.invokeService('paintObjectSelection', {
                sceneId: sid,
                objId: found.numId,
                colorValue,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const applyRendererStyle = useCallback(
        async (
            id: string,
            styleName: string,
            pattern: string,
            flags: string,
        ): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'renderer')
            if (!found) return false
            const res = await cm.invokeService('applyRendererStyle', {
                sceneId: sid,
                rendId: found.numId,
                styleName,
                pattern,
                flags,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const setRendererSelection = useCallback(
        async (id: string, selKind: ChangeRendSelKind): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'renderer')
            if (!found) return false
            const res = await cm.invokeService('setRendererSelection', {
                sceneId: sid,
                rendId: found.numId,
                selKind,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const generateRendererSurfObj = useCallback(
        async (id: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'renderer')
            if (!found) return false
            const res = await cm.invokeService('generateRendererSurfObj', {
                sceneId: sid,
                rendId: found.numId,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const createRendererGroup = useCallback(
        async (objId: string, name: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, objId, 'object')
            if (!found) return false
            const res = await cm.invokeService('createRendererGroup', {
                sceneId: sid,
                objId: found.numId,
                name,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const changeRendererType = useCallback(
        async (rendId: string, newType: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, rendId, 'renderer')
            if (!found) return false
            const res = await cm.invokeService('changeRendererType', {
                sceneId: sid,
                rendId: found.numId,
                newType,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const createRendererOnObject = useCallback(
        async (
            targetObjId: number,
            rendOpts: RendererOptions,
            groupName?: string,
        ): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('createRendererOnObject', {
                sceneId: sid,
                objId: targetObjId,
                rendOpts,
                groupName,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    return {
        setRendererColoring,
        paintRendererSelection,
        paintObjectSelection,
        applyRendererStyle,
        setRendererSelection,
        generateRendererSurfObj,
        createRendererGroup,
        changeRendererType,
        createRendererOnObject,
    }
}
