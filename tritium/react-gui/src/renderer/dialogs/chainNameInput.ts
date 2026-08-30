/**
 * @file dialogs/chainNameInput.ts
 * @description Pure normalization of the "New chain ID" text field for the
 * Change chain ID dialog. Mirrors UXP `tools/chg_chname.js` (onDialogAccept,
 * lines 127-144):
 *   - empty string is rejected,
 *   - a whitespace-only value means a blank chain ID, stored as "_" (the UXP
 *     prompt says "< > will be converted to <_>"); the caller confirms first,
 *   - a value whose trimmed length is > 1 does not conform to the PDB format;
 *     the caller confirms first,
 *   - otherwise the trimmed single character is used as-is.
 */

export type ChainNameResolution =
    | { kind: 'empty' }
    | { kind: 'blank'; value: '_' }
    | { kind: 'long'; value: string }
    | { kind: 'ok'; value: string }

/**
 * Classify a raw chain-ID input into the action the dialog should take.
 *
 * @param raw - the unmodified text field value
 * @returns a discriminated resolution; `blank` and `long` require a user
 *   confirmation before committing, `ok` commits directly, `empty` is rejected.
 */
export function resolveChainNameInput(raw: string): ChainNameResolution {
    if (raw === '') return { kind: 'empty' }
    const trimmed = raw.trim()
    // Whitespace-only -> blank chain ID, represented as "_".
    if (trimmed === '') return { kind: 'blank', value: '_' }
    if (trimmed.length > 1) return { kind: 'long', value: trimmed }
    return { kind: 'ok', value: trimmed }
}
