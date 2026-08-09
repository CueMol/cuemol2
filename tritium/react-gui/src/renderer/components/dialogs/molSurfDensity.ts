/**
 * @file components/dialogs/molSurfDensity.ts
 * @description Shared point-density input state for the two molecular-surface
 * dialogs (`MakeMolSurfDialog` creates a surface, `RegenMolSurfDialog` rebuilds
 * one). Both present the density as an editable `ComboBoxField` with the same
 * preset list, and both need the same free-typing behaviour: the raw text stays
 * local until it parses to a positive integer, so intermediate states ('' while
 * clearing the box, '1e') do not clobber the committed value.
 */

import { useCallback, useState } from 'react'

/**
 * UXP XUL default: the density numberbox has `min="1"` and no explicit
 * `value=`, so it initialises to its min.
 */
export const DEFAULT_DENSITY = 1

/**
 * Common point-density values offered in the dropdown. Typing any other
 * positive integer is still accepted -- these are shortcuts, not a whitelist.
 */
export const DENSITY_PRESETS = ['1', '2', '3', '4', '5']

export interface MolSurfDensityField {
    /** Committed density; always a positive integer. */
    density: number
    /** Set the committed density and resync the draft (open / reset paths). */
    setDensity: (next: number) => void
    /** Raw combobox text, which may be mid-edit and unparseable. */
    draft: string
    /** `ComboBoxField.onChange` handler. */
    onDraftChange: (text: string) => void
}

/**
 * Owns the committed density plus its editing draft.
 *
 * @param initial - starting density (defaults to {@link DEFAULT_DENSITY}).
 */
export function useMolSurfDensity(initial: number = DEFAULT_DENSITY): MolSurfDensityField {
    const [density, setDensityValue] = useState<number>(initial)
    const [draft, setDraft] = useState<string>(String(initial))

    const setDensity = useCallback((next: number) => {
        setDensityValue(next)
        setDraft(String(next))
    }, [])

    const onDraftChange = useCallback((text: string) => {
        setDraft(text)
        const n = Math.round(Number(text))
        if (Number.isFinite(n) && n >= 1) setDensityValue(n)
    }, [])

    return { density, setDensity, draft, onDraftChange }
}
