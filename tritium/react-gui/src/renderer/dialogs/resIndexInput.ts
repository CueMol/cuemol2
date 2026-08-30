/**
 * @file components/dialogs/resIndexInput.ts
 * @description Pure validation of the numeric field for the Change residue
 * index dialog. Mirrors UXP `tools/chg_resindex.js` (onDialogAccept, lines
 * 157-181):
 *   - the value is parsed with parseInt,
 *   - "Shift by" mode rejects NaN and 0 (a zero shift is a no-op),
 *   - "Start from" mode rejects NaN; a start number outside +-4 digits
 *     (> 9999 or < -999) does not conform to the PDB format and the caller
 *     confirms before committing.
 */

export type ResIndexMode = 'shift' | 'start'

export type ResIndexResolution =
    | { kind: 'invalid'; message: string }
    | { kind: 'pdb-warn'; value: number; message: string }
    | { kind: 'ok'; value: number }

/**
 * Classify the residue-index value input for the given mode.
 *
 * @param mode - 'shift' (relative) or 'start' (absolute first number)
 * @param raw - the unmodified text field value
 * @returns a discriminated resolution; `pdb-warn` requires a user confirmation
 *   before committing, `ok` commits directly, `invalid` is rejected.
 */
export function resolveResIndexInput(
    mode: ResIndexMode,
    raw: string,
): ResIndexResolution {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) {
        return {
            kind: 'invalid',
            message:
                mode === 'shift'
                    ? 'Invalid residue shift value.'
                    : 'Invalid start residue number.',
        }
    }
    if (mode === 'shift') {
        if (n === 0) {
            return { kind: 'invalid', message: 'Residue shift value must not be zero.' }
        }
        return { kind: 'ok', value: n }
    }
    // start mode
    if (n > 9999 || n < -999) {
        return {
            kind: 'pdb-warn',
            value: n,
            message:
                'Residue number larger than 4 digits does not conform to the PDB format. Change the residue index?',
        }
    }
    return { kind: 'ok', value: n }
}
