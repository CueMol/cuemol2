/**
 * @file components/dialogs/RegenMolSurfDialog.tsx
 * @description Modal that rebuilds an existing `MolSurfObj` from the molecule
 * it was originally generated from. Ports the "regeneration mode" of the UXP
 * `tools/makesurf.xul` dialog (opened from the workspace-panel object context
 * menu via `onMolSurfRegen`), which disables every widget except the point
 * density.
 *
 * Point density is therefore the only editable field: the scripting interface
 * exposes just the first argument of C++
 * `MolSurfObj::regenerateSES(density, probe_r, pSel)`, so the target molecule,
 * atom selection and probe radius always come from the object's stored
 * `orig_*` state and are shown here read-only for context. All of them are
 * pre-fetched by the caller (`getMolSurfRegenInfo`) and arrive as props.
 *
 * OK commits via the `regenMolSurf` worker service under one undo txn.
 */

import React, { useEffect, useState } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolEditCommit } from '@renderer/hooks/cuemol/useMolEditCommit'
import { Field, FieldSection, SelectField, SliderField, TextField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { clampDensity, DENSITY_MAX, DENSITY_MIN } from './molSurfDensity'
import { asBackend, BACKEND_OPTIONS, DEFAULT_BACKEND, MolSurfBackend } from './molSurfBackend'

export interface RegenMolSurfDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    /** Target MolSurfObj uid. */
    objId: number
    /** Name of the surface object being regenerated. */
    objName: string
    /** `orig_mol` -- name of the molecule the surface was generated from. */
    origMol: string
    /** `orig_sel` as a selection string; '' means all atoms. */
    selStr: string
    /** `orig_den` -- prefills the density field. */
    density: number
    /** `orig_prad` -- shown read-only (not settable through `regenerateSES1`). */
    probeRadius: number
    onConfirm: (result: RegenMolSurfDialogResult) => void
    onCancel: () => void
}

export function RegenMolSurfDialog({
    visible, sceneId, objId, objName, origMol, selStr, density: origDensity,
    probeRadius, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { cm } = useCueMol()

    const [density, setDensity] = useState<number>(clampDensity(origDensity))
    const [backend, setBackend] = useState<MolSurfBackend>(DEFAULT_BACKEND)

    // The provider keeps this component mounted across show/hide cycles, so
    // the density has to be re-seeded from the freshly pre-fetched `orig_den`
    // every time the dialog opens on a (possibly different) surface. Clamped
    // into the slider range (a stored density can exceed it).
    useEffect(() => {
        if (!visible) return
        setDensity(clampDensity(origDensity))
    }, [visible, objId, origDensity])

    const { submitting, errorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            buildCommit: () => ({
                invoke: () => cm!.invokeService('regenMolSurf', {
                    sceneId,
                    objId,
                    density,
                    backend,
                }),
                onSuccess: () => onConfirm({ ok: true }),
                fallbackError: 'Failed to generate molecular surface',
            }),
        })

    return (
        <DialogShell
            visible={visible}
            title="Regenerate surface"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            submitting={submitting}
            errorMsg={errorMsg}
        >
            <FieldSection title="Target">
                <Field label="Surface object">
                    <TextField value={objName} onChange={() => {}} readOnly />
                </Field>
                <Field label="Molecule">
                    <TextField value={origMol} onChange={() => {}} readOnly />
                </Field>
                <Field label="Selection">
                    <TextField
                        value={selStr === '' ? '(all atoms)' : selStr}
                        onChange={() => {}}
                        readOnly
                    />
                </Field>
                <Field label="Probe radius (A)">
                    <TextField value={String(probeRadius)} onChange={() => {}} readOnly />
                </Field>
            </FieldSection>

            <FieldSection title="Surface">
                <SliderField
                    label="Point density (/A)"
                    value={density}
                    min={DENSITY_MIN}
                    max={DENSITY_MAX}
                    step={1}
                    onCommit={setDensity}
                    disabled={submitting}
                />
                <Field label="Algorithm">
                    <SelectField
                        value={backend}
                        onChange={(v) => setBackend(asBackend(v))}
                        disabled={submitting}
                    >
                        {BACKEND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </SelectField>
                </Field>
            </FieldSection>
        </DialogShell>
    )
}
