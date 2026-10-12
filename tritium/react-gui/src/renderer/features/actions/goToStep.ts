/**
 * @file features/actions/goToStep.ts
 * @description Which undo or redo brings the scene to the state right after
 * a step of the Action history pane.
 */

import type { ActionStepView } from '@renderer/worker/shared/actionTypes'

/**
 * The move that leaves `stepId` as the last step done; null `stepId` is the
 * initial state (every step undone).
 *
 * `depth` is what `pickUndo` / `pickRedo` take: they undo or redo
 * `depth + 1` steps.
 *
 * @returns the move, null when the scene is already there or the step is
 *   not in `steps`.
 */
export function goToStep(
    steps: readonly ActionStepView[],
    stepId: number | null,
): { kind: 'undo' | 'redo'; depth: number } | null {
    const done = steps.filter((s) => !s.undone).length
    const index = stepId === null ? -1 : steps.findIndex((s) => s.id === stepId)
    if (stepId !== null && index < 0) return null
    const target = index + 1
    if (target < done) return { kind: 'undo', depth: done - target - 1 }
    if (target > done) return { kind: 'redo', depth: target - done - 1 }
    return null
}
