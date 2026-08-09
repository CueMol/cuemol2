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

import React, { useEffect } from 'react'
import { useCueMol } from '../../hooks/useCueMol'
import { useMolEditCommit } from '../../hooks/useMolEditCommit'
import { ComboBoxField, Field, FieldSection, TextField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { DENSITY_PRESETS, useMolSurfDensity } from './molSurfDensity'

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

    const {
        density, setDensity, draft: densityDraft, onDraftChange: handleDensityChange,
    } = useMolSurfDensity(origDensity)

    // The provider keeps this component mounted across show/hide cycles, so
    // the density has to be re-seeded from the freshly pre-fetched `orig_den`
    // every time the dialog opens on a (possibly different) surface.
    useEffect(() => {
        if (!visible) return
        setDensity(origDensity >= 1 ? Math.round(origDensity) : 1)
    }, [visible, objId, origDensity, setDensity])

    const { submitting, errorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            buildCommit: () => ({
                invoke: () => cm!.invokeService('regenMolSurf', {
                    sceneId,
                    objId,
                    density,
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
                <Field label="Point density (/A)">
                    <ComboBoxField
                        value={densityDraft}
                        onChange={handleDensityChange}
                        options={DENSITY_PRESETS}
                        disabled={submitting}
                    />
                </Field>
            </FieldSection>
        </DialogShell>
    )
}
