/**
 * @file features/actions/actionOps.ts
 * @description Worker calls behind the Action history pane and its
 * commands, as plain async functions.
 *
 * Steps are addressed by the action log's step id, which stays put while
 * steps before and after it come and go; a row number would not.
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActionStepView } from '@renderer/worker/shared/actionTypes'

/** The scene's undo steps, oldest first, the redo side last. */
export async function getActionSteps(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
): Promise<ActionStepView[]> {
    if (!cm || sceneId === undefined) return []
    const res = await cm.invokeService('getActionSteps', { sceneId })
    return res?.ok ? res.steps : []
}

/**
 * Write steps to a qax file.
 *
 * @returns null, or why they could not be written.
 */
export async function exportActionSteps(
    cm: AsyncCueMol,
    sceneId: number,
    stepIds: number[],
    filePath: string,
): Promise<string | null> {
    const res = await cm.invokeService('exportActionSteps', { sceneId, stepIds, filePath })
    return res.ok ? null : res.error
}

/** Steps as native console lines, or null with the reason logged. */
export async function actionStepLines(
    cm: AsyncCueMol,
    sceneId: number,
    stepIds: number[],
): Promise<string | null> {
    const res = await cm.invokeService('actionStepLines', { sceneId, stepIds })
    if (res.ok) return res.text
    console.warn('actionStepLines failed:', res.error)
    return null
}
