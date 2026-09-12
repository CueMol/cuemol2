/**
 * @file worker/server/services/helpers/atomintr.ts
 * @description The `atomintr` renderer: atom interaction labels (distance /
 * angle / torsion measures and interaction analysis).
 *
 * Centralised so everything that draws one agrees on the renderer type, the
 * default styles, the default label-set name (UXP parity) and how a label is
 * appended. Two callers reach it by different routes -- the measure tool,
 * where the user picks atoms with the mouse, and the AI agent, which names
 * them -- and a second copy of the create-or-reuse logic is how the two would
 * start drawing into different renderers.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { AtomIntrRenderer } from '@cuemol/core/src/wrappers/AtomIntrRenderer';
import { withUndoTxn } from '../withUndoTxn';

/** Renderer type name for distance / angle / torsion / interaction labels. */
export const ATOMINTR_TYPE = 'atomintr';

/** Default styles applied to a freshly created atomintr renderer (UXP parity). */
export const ATOMINTR_STYLES = 'DefaultLabel,DefaultAtomIntr';

/** Default label-set name used when no explicit target is chosen. */
export const ATOMINTR_DEFAULT_TARGET_NAME = 'measure';

/**
 * Measure sub-mode. The atom count is 2 / 3 / 4 for distance / angle /
 * torsion respectively.
 */
export type MeasureMode = 'distance' | 'angle' | 'torsion';

/** One atom of a measurement: the molecule object uid and the atom id in it. */
export interface MeasureAtomRef {
    objId: number;
    atomId: number;
}

/** How many atoms `mode` needs. */
export function measureAtomCount(mode: MeasureMode): number {
    if (mode === 'distance') return 2;
    if (mode === 'angle') return 3;
    return 4;
}

/** Human-readable noun for status messages and undo labels. */
export function measureLabelNoun(mode: MeasureMode): string {
    if (mode === 'distance') return 'Distance';
    if (mode === 'angle') return 'Angle';
    return 'Torsion';
}

/**
 * Draw a measure label on `mol`, in its own undo transaction.
 *
 * Reuses the atomintr renderer named `targetName` when the molecule already
 * has one, so repeated measurements collect in one label set instead of
 * stacking up renderers.
 *
 * The first atom is implicitly the renderer's own molecule; every later atom
 * passes its object uid, so a measurement may span molecules (UXP parity).
 *
 * @param atoms - exactly `measureAtomCount(mode)` entries, first one on `mol`.
 */
export function appendMeasureLabel(
    scene: Scene,
    mol: MolCoord,
    mode: MeasureMode,
    atoms: MeasureAtomRef[],
    targetName: string = ATOMINTR_DEFAULT_TARGET_NAME,
): void {
    const name = targetName.trim() || ATOMINTR_DEFAULT_TARGET_NAME;
    withUndoTxn(scene, `Define ${measureLabelNoun(mode)} Label`, () => {
        let rend = mol.getRendererByNameType(name, ATOMINTR_TYPE) as AtomIntrRenderer | null;
        if (!rend) {
            rend = mol.createRenderer(ATOMINTR_TYPE) as AtomIntrRenderer;
            rend.name = name;
            rend.applyStyles(ATOMINTR_STYLES);
        }
        const p = atoms;
        if (mode === 'distance') {
            rend.appendById(p[0].atomId, p[1].objId, p[1].atomId, true);
        } else if (mode === 'angle') {
            rend.appendAngleById(p[0].atomId, p[1].objId, p[1].atomId, p[2].objId, p[2].atomId);
        } else {
            rend.appendTorsionById(
                p[0].atomId, p[1].objId, p[1].atomId,
                p[2].objId, p[2].atomId, p[3].objId, p[3].atomId,
            );
        }
    });
}

/**
 * Whether a pick sequence is degenerate, i.e. would define a zero-length or
 * undefined measurement (UXP `defineDistLabel` guard). Any two consecutive
 * atoms being the same is rejected; for an angle the two outer atoms must
 * differ too.
 */
export function hasDegenerateAtoms(mode: MeasureMode, atoms: MeasureAtomRef[]): boolean {
    const same = (a: MeasureAtomRef, b: MeasureAtomRef): boolean =>
        a.objId === b.objId && a.atomId === b.atomId;
    for (let i = 1; i < atoms.length; i++) {
        if (same(atoms[i - 1], atoms[i])) return true;
    }
    if (mode === 'angle' && same(atoms[0], atoms[2])) return true;
    return false;
}
