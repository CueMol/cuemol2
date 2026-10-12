// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
/**
 * @file worker/server/services/actions/actions.ts
 * @description The action log for the GUI: the steps of a scene, a range of
 * them written to a qax file or as console lines.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { actionRows } from '@renderer/worker/server/actions/actionLog';
import type { ActionRow } from '@renderer/worker/server/actions/actionLog';
import { entryLine, rowView, writeRowsFile } from '@renderer/worker/server/actions/export';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import type { ActionStepView, ActionStepsArgs } from '@renderer/worker/shared/actionTypes';
import { fail, ok } from '@renderer/worker/shared/result';
import type { Result } from '@renderer/worker/shared/result';

export interface GetActionStepsArgs {
    sceneId: number;
}

/** The steps of a scene, oldest first, the redo side last. */
export function getActionSteps(ctx: WorkerContext, args: GetActionStepsArgs): Result<{ steps: ActionStepView[] }> {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    return ok({ steps: actionRows(scene, args.sceneId).map(rowView) });
}

/** The rows named, in log order; a failure when one is no longer there. */
function pickRows(ctx: WorkerContext, args: ActionStepsArgs): Result<{ rows: ActionRow[] }> {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    const wanted = new Set(args.stepIds);
    const rows = actionRows(scene, args.sceneId).filter((r) => wanted.has(r.id));
    if (rows.length !== wanted.size) return fail('a step is no longer in the undo history', 'not-found');
    if (rows.length === 0) return fail('no steps given', 'invalid-args');
    return ok({ rows });
}

export interface ExportActionStepsArgs extends ActionStepsArgs {
    filePath: string;
}

/** Write steps to a qax file, to run again with the console's `run`. */
export function exportActionSteps(ctx: WorkerContext, args: ExportActionStepsArgs): Result<{ count: number }> {
    const picked = pickRows(ctx, args);
    if (!picked.ok) return picked;
    const problem = writeRowsFile(picked.rows, args.filePath);
    return problem === null ? ok({ count: picked.rows.length }) : fail(problem, 'io');
}

/**
 * Steps as native console lines, one per op, for the clipboard. A step with
 * no op is a `#` comment line with its label.
 */
export function actionStepLines(ctx: WorkerContext, args: ActionStepsArgs): Result<{ text: string }> {
    const picked = pickRows(ctx, args);
    if (!picked.ok) return picked;
    const lines = picked.rows.flatMap((r) =>
        r.entries.length > 0 ? r.entries.map(entryLine) : [`# ${r.label}`],
    );
    return ok({ text: `${lines.join('\n')}\n` });
}
