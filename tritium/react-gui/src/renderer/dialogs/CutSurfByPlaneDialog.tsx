/**
 * @file dialogs/CutSurfByPlaneDialog.tsx
 * @description Modal that cuts a molecular surface (`MolSurfObj`) by the
 * current view's clipping plane. Ports the UXP `tools/surf-cutbyplane.xul` +
 * `surf-cutbyplane.js` dialog:
 *   - Target surface (`ObjectSelect`, MolSurfObj only).
 *   - Cross-section type (`SelectField`: Complete / Separately / Section only /
 *     No section -> full / separate / sect / body).
 *   - Section mesh density (/A).
 *   - OK commits via the `cutSurfByPlane` worker service under one undo txn;
 *     the worker derives the clip plane from the active view.
 *
 * The caller passes `{ sceneId, viewId }` (the plane is computed from the
 * view). The last-picked surface persists within the session.
 */

import React, { useState } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolEditCommit } from '@renderer/hooks/cuemol/useMolEditCommit'
import { Field, FieldSection, NumericField, SelectField } from '@renderer/h3-kit/form'
import { DialogShell } from './DialogShell'
import { ObjectSelect, objectFilters } from '@renderer/h3-kit/ObjectSelect'
import type { CutSurfMode } from '@renderer/worker/server/services/cutSurfByPlane.service'

export interface CutSurfByPlaneDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    viewId: number
    onConfirm: (result: CutSurfByPlaneDialogResult) => void
    onCancel: () => void
}

const DEFAULT_DENSITY = 5.0

const MODE_OPTIONS: { value: CutSurfMode; label: string }[] = [
    { value: 'full', label: 'Complete' },
    { value: 'separate', label: 'Separately' },
    { value: 'sect', label: 'Section only' },
    { value: 'body', label: 'No section' },
]

export function CutSurfByPlaneDialog({
    visible, sceneId, viewId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [mode, setMode] = useState<CutSurfMode>('full')
    const [density, setDensity] = useState<number>(DEFAULT_DENSITY)

    // Commit handler + submitting/errorMsg state + reset-on-open. The surface
    // id is intentionally NOT reset (last-picked surface persists in-session).
    const { submitting, errorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            onReset: () => {
                setMode('full')
                setDensity(DEFAULT_DENSITY)
            },
            buildCommit: () => {
                if (objId === undefined) return null
                return {
                    invoke: () => cm!.invokeService('cutSurfByPlane', {
                        sceneId,
                        viewId,
                        objId,
                        mode,
                        density,
                    }),
                    onSuccess: () => onConfirm({ ok: true }),
                    fallbackError: 'Failed to cut surface',
                }
            },
        })

    return (
        <DialogShell
            visible={visible}
            title="Mol surface cutter"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={objId === undefined}
            submitting={submitting}
            errorMsg={errorMsg}
        >
                    <FieldSection title="Surface">
                        <Field label="Target surface">
                            <ObjectSelect
                                cm={cm}
                                sceneId={sceneId}
                                label="Target surface"
                                filter={objectFilters.molSurf}
                                selectedId={objId}
                                onChange={setObjId}
                                emptyText="(no surfaces)"
                                fallbackName={(m) => `Surf ${m.uid}`}
                                hideLabel
                            />
                        </Field>
                        <Field label="Cross section">
                            <SelectField
                                value={mode}
                                onChange={(v) => setMode(v as CutSurfMode)}
                                disabled={submitting}
                            >
                                {MODE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </SelectField>
                        </Field>
                        <Field label="Section mesh density (/A)">
                            <NumericField
                                value={density}
                                onChange={setDensity}
                                min={0.1}
                                max={50}
                                step={0.5}
                                slider={false}
                                disabled={submitting}
                            />
                        </Field>
                    </FieldSection>
        </DialogShell>
    )
}
