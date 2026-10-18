// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Name labels on every atom of a selection (the PyMOL dialect's `label`), on
// a `*namelabel` renderer picked by name. C++ NameLabelRenderer records each
// label change for undo, so the whole call is one step.
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { fail, failFrom, ok } from '@renderer/worker/shared/result';
import type { Result } from '@renderer/worker/shared/result';
import { undoTxnResult } from '../withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { recordOp } from '@renderer/worker/server/actions/serviceOps';

const LABEL_TYPE = '*namelabel';

interface LabelRenderer {
    uid: number;
    name: string;
    maxlabel: number;
    applyStyles(style: string): void;
    setLabel(aid: number, format: string): boolean;
    removeLabel(aid: number): boolean;
}

interface AtomIter {
    target: unknown;
    sel: unknown;
    first(): void;
    next(): void;
    hasMore(): boolean;
    getID(): number;
}

/** The atom ids `selStr` matches in `mol`, or null when it does not compile. */
export function selectionAtomIds(ctx: WorkerContext, sceneId: number, mol: unknown, selStr: string): number[] | null {
    const sel = makeSel(ctx, selStr, sceneId);
    const iter = ctx.svc.createObj('AtomIterator') as unknown as AtomIter | null;
    if (!sel || !iter) return null;
    iter.target = mol;
    iter.sel = sel;
    const ids: number[] = [];
    for (iter.first(); iter.hasMore(); iter.next()) ids.push(iter.getID());
    return ids;
}

export interface SetAtomLabelsArgs {
    sceneId: number;
    objId: number;
    selection: string;
    /** Label format ("{resn}{resi}"; '' the renderer's default). Null takes the labels off. */
    format: string | null;
    /** The `*namelabel` renderer's name; '' is the unnamed one the navigate tool uses. */
    rendererName: string;
}

/**
 * Label every atom of the selection, or take their labels off.
 *
 * Adding makes the named label renderer (DefaultLabel style) when the object
 * has none, and raises its `maxlabel` by the atom count, since the renderer
 * drops its oldest labels beyond it.
 *
 * @returns the label renderer (null when removing found none) and whether it was made here.
 */
export function setAtomLabels(
    ctx: WorkerContext,
    args: SetAtomLabelsArgs,
): Result<{ rendId: number | null; created: boolean }> {
    const scene = getSceneOrNull(ctx, args.sceneId);
    const mol = scene?.getObject(args.objId) as MolCoord | null | undefined;
    if (!scene || !mol) return fail('molecule not found', 'not-found');
    const ids = selectionAtomIds(ctx, args.sceneId, mol, args.selection);
    if (ids === null) return fail(`"${args.selection}" did not compile`, 'invalid-args');
    const removing = args.format === null;
    if (ids.length === 0 && !removing) return fail(`"${args.selection}" matched no atoms`, 'invalid-args');

    let rend = mol.getRendererByNameType(args.rendererName, LABEL_TYPE) as unknown as LabelRenderer | null;
    if (!rend && removing) return ok({ rendId: null, created: false });
    const created = !rend;
    return undoTxnResult(scene, removing ? 'Remove labels' : 'Label atoms', () => {
        recordOp(ctx, args.sceneId, 'set_atom_labels', {
            objId: args.objId,
            selection: args.selection,
            format: args.format,
            rendererName: args.rendererName,
        }, ['objId']);
        try {
            if (!rend) {
                rend = mol.createRenderer(LABEL_TYPE) as unknown as LabelRenderer | null;
                if (!rend) return fail('could not make a label renderer', 'native');
                rend.applyStyles('DefaultLabel');
                if (args.rendererName !== '') rend.name = args.rendererName;
            }
            if (args.format === null) {
                for (const aid of ids) rend.removeLabel(aid);
            } else {
                rend.maxlabel = rend.maxlabel + ids.length;
                for (const aid of ids) rend.setLabel(aid, args.format);
            }
        } catch (e) {
            return failFrom(e, 'native');
        }
        return ok({ rendId: rend.uid, created });
    });
}
