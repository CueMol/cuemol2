/**
 * @file worker/server/services/analyzeInteractions.service.ts
 * @description Worker service backing the "Interaction analysis" tool dialog
 * (`dialog.tool.intr-tool`). Ports UXP `tools/intr-tool.js`
 * (`IntrTool.onDialogAccept`):
 *   - Compile selection 1 (and optionally selection 2) against the molecule.
 *   - Ask `MolAnlManager` for the atom contact pairs as JSON, dispatching to
 *     `calcAtomContactJSON` / `calcAtomContact2JSON` / `calcAtomContact3JSON`
 *     depending on whether a second molecule / second selection is used.
 *   - Reuse (or create) the named `atomintr` renderer on molecule 1, then
 *     register every returned atom pair via `appendById`, all inside a single
 *     "Define Label(s)" undo txn.
 *
 * The molecule pickers, selection editing and numeric inputs live client-side
 * in `InteractionAnalysisDialog`; this service performs the C++ analysis +
 * label creation so it can be wrapped in one undo step. The label-set reuse /
 * create / appendById pattern mirrors `measure.service.ts`.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { AtomIntrRenderer } from '@cuemol/core/src/wrappers/AtomIntrRenderer';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from '../withUndoTxn';
import {
    ATOMINTR_TYPE,
    ATOMINTR_STYLES,
    ATOMINTR_DEFAULT_TARGET_NAME,
} from '@renderer/worker/server/services/helpers/atomintr';

export interface AnalyzeInteractionsArgs {
    sceneId: number;
    /** Primary MolCoord object uid (molecule 1). */
    objId: number;
    /** Atom-selection expression for molecule 1; empty means "all atoms". */
    selStr: string;
    /** When true, restrict contacts to a second molecule (molecule 2). */
    useMol2: boolean;
    /** Molecule 2 object uid; required when useMol2 is true. */
    objId2?: number;
    /** When true, use a second selection (within molecule 1 when useMol2 off). */
    useSel2: boolean;
    /** Atom-selection expression for selection 2. */
    selStr2?: string;
    /** Minimum contact distance (A). */
    minDist: number;
    /** Maximum contact distance (A). */
    maxDist: number;
    /** Maximum number of labels to create. */
    maxLabels: number;
    /** Restrict to hydrogen-bond candidate atoms (N, O) only. */
    hbondOnly: boolean;
    /** Target atomintr label-set name (defaults to "measure"). */
    rendName: string;
}

export interface AnalyzeInteractionsResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
    /** Number of interaction labels created on success. */
    count?: number;
}

export function analyzeInteractions(
    ctx: WorkerContext,
    args: AnalyzeInteractionsArgs,
): AnalyzeInteractionsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };

    // Molecule 2 is only honoured when distinct from molecule 1 (UXP parity).
    let mol2: CueMolObject | null = null;
    if (args.useMol2 && args.objId2 !== undefined && args.objId2 !== args.objId) {
        mol2 = scene.getObject(args.objId2) as CueMolObject | null;
        if (!mol2) return { ok: false, error: 'second molecule not found' };
    }

    const sel = makeSel(ctx, args.selStr ?? '', scene.uid);
    if (!sel) return { ok: false, error: 'invalid selection' };

    // Selection 2 is compiled when a second molecule or second selection is in
    // play (both calcAtomContact2/3JSON take a second selection argument).
    const needSel2 = mol2 !== null || args.useSel2;
    let sel2: ReturnType<typeof makeSel> = null;
    if (needSel2) {
        sel2 = makeSel(ctx, args.selStr2 ?? '', scene.uid);
        if (!sel2) return { ok: false, error: 'invalid second selection' };
    }

    const rmin = args.minDist;
    const rmax = args.maxDist;
    if (!Number.isFinite(rmin) || !Number.isFinite(rmax)) {
        return { ok: false, error: 'invalid distance range' };
    }
    if (rmin >= rmax) {
        return { ok: false, error: 'Min distance must be smaller than max distance' };
    }
    const nmax = Math.floor(args.maxLabels);
    if (!Number.isFinite(nmax) || nmax <= 0) {
        return { ok: false, error: 'invalid max labels' };
    }

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null;
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    const m1 = mol as unknown as MolCoord;
    const s1 = sel as unknown as MolSelection;
    const s2 = sel2 as unknown as MolSelection;

    let json: string;
    try {
        if (mol2) {
            json = mgr.calcAtomContact3JSON(
                m1, s1, mol2 as unknown as MolCoord, s2,
                rmin, rmax, args.hbondOnly, nmax,
            );
        } else if (args.useSel2) {
            json = mgr.calcAtomContact2JSON(
                m1, s1, s2, rmin, rmax, args.hbondOnly, nmax,
            );
        } else {
            json = mgr.calcAtomContactJSON(
                m1, s1, rmin, rmax, args.hbondOnly, nmax,
            );
        }
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    let pairs: Array<[number, number]> = [];
    try {
        pairs = JSON.parse(json) as Array<[number, number]>;
    } catch {
        pairs = [];
    }
    if (!Array.isArray(pairs) || pairs.length === 0) {
        return { ok: false, error: 'No interaction was found', count: 0 };
    }

    // Atom pairs reference molecule 2's uid when a second molecule is used,
    // otherwise molecule 1's uid (UXP `appendById(aid1, mol.uid, aid2, false)`).
    const pairObjUid = (mol2 ?? mol as unknown as { uid: number }) as unknown as {
        uid: number;
    };
    const name = args.rendName.trim() || ATOMINTR_DEFAULT_TARGET_NAME;

    let count = 0;
    try {
        withUndoTxn(scene, 'Define Label(s)', () => {
            let rend = (mol as unknown as MolCoord).getRendererByNameType(
                name, ATOMINTR_TYPE,
            ) as AtomIntrRenderer | null;
            if (!rend) {
                rend = (mol as unknown as CueMolObject).createRenderer(
                    ATOMINTR_TYPE,
                ) as unknown as AtomIntrRenderer;
                (rend as unknown as { name: string }).name = name;
                rend.applyStyles(ATOMINTR_STYLES);
            }
            for (const pair of pairs) {
                rend.appendById(pair[0], pairObjUid.uid, pair[1], false);
                count++;
            }
        });
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    return { ok: true, count };
}
