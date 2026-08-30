/**
 * @file components/dialogs/MolPicker.tsx
 * @description Thin preset over `ObjectSelect` for the recurring "pick a
 * MolCoord" dropdown used by the molecule-edit dialogs. It hard-wires the
 * `objectFilters.molCoord` filter plus the shared empty-text / fallback-name /
 * `hideLabel` defaults so the byte-identical block stops being copy-pasted
 * across the dialogs (12 occurrences / 8 files).
 *
 * Only the per-dialog parts (`label`, controlled `selectedId` / `onChange`)
 * remain props; `cm` / `sceneId` are forwarded unchanged. Callers that need a
 * non-molecule filter (e.g. the surface picker) keep using `ObjectSelect`
 * directly -- this preset is intentionally molecule-only.
 */

import React from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { ObjectSelect, objectFilters } from '@renderer/h3-kit/ObjectSelect'

export interface MolPickerProps {
    /** Worker facade used by the embedded `ObjectSelect` to list objects. */
    cm: AsyncCueMol | null
    /** Scene whose MolCoord objects are listed. */
    sceneId: number | undefined
    /** Accessible name for the dropdown (e.g. "Molecule", "From molecule"). */
    label: string
    /** Controlled selection -- the picked molecule uid (or undefined). */
    selectedId: number | undefined
    /** Called with the new uid on pick / auto-default. */
    onChange: (uid: number | undefined) => void
}

/**
 * Molecule picker dropdown: `ObjectSelect` preset to the MolCoord filter with
 * the molecule-edit-dialog defaults (empty text, `Mol <uid>` fallback name,
 * `hideLabel`).
 */
export function MolPicker({
    cm, sceneId, label, selectedId, onChange,
}: MolPickerProps): React.JSX.Element {
    return (
        <ObjectSelect
            cm={cm}
            sceneId={sceneId}
            label={label}
            filter={objectFilters.molCoord}
            selectedId={selectedId}
            onChange={onChange}
            emptyText="(no molecules)"
            fallbackName={(m) => `Mol ${m.uid}`}
            hideLabel
        />
    )
}
