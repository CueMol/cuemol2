/**
 * @file components/dialogs/MakeMolSurfDialog.tsx
 * @description Modal that builds a solvent-excluded molecular surface
 * (`MolSurfObj`) from a molecule. Ports the UXP `tools/makesurf.xul` +
 * `makesurf.js` dialog (built-in surface algorithm, not external MSMS):
 *   - Target molecule (`ObjectSelect`).
 *   - Optional atom selection (`CheckboxField` gate + `MolSelList`).
 *   - Surface object name (`TextField`; prefilled with a unique `sf_<molname>`
 *     via `proposeMolSurfName` and refreshed when the molecule changes, like
 *     UXP `makeSugName`).
 *   - Point density (/A): a `SliderField` (slider + number box + stepper)
 *     clamped to the shared 1-10 integer range (`molSurfDensity.ts`). Probe
 *     radius (A) stays a plain numeric input. Defaults match the UXP XUL:
 *     density = 1 (min, no explicit value), probe radius = 1.4.
 *   - OK commits via the `makeMolSurf` worker service under one undo txn.
 *
 * The caller passes only `{ sceneId }`. The last-picked molecule persists
 * within the session because the id is not reset on open. The UXP
 * regeneration mode is intentionally out of scope.
 */

import React, { useEffect, useState } from 'react'
import { useCueMol } from '../../hooks/useCueMol'
import { useMolEditCommit } from '../../hooks/useMolEditCommit'
import { CheckboxField, Field, FieldSection, NumericField, SliderField, TextField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { MolPicker } from './MolPicker'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'
import { DEFAULT_DENSITY, DENSITY_MAX, DENSITY_MIN } from './molSurfDensity'

export interface MakeMolSurfDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: MakeMolSurfDialogResult) => void
    onCancel: () => void
}

// UXP XUL default for the probe radius (`value="1.4"`). The density default
// and its preset list live in `molSurfDensity.ts`, shared with the regenerate
// dialog.
const DEFAULT_PROBE_RADIUS = 1.4

export function MakeMolSurfDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [useSel, setUseSel] = useState<boolean>(false)
    const [selStr, setSelStr] = useState<string>('')
    const [surfName, setSurfName] = useState<string>('')
    const [probeRadius, setProbeRadius] = useState<number>(DEFAULT_PROBE_RADIUS)

    const [density, setDensity] = useState<number>(DEFAULT_DENSITY)

    // Commit handler + submitting/errorMsg state + reset-on-open. The molecule
    // id is intentionally NOT reset (last-picked persists); the surface name is
    // owned by the prefill effect below, so neither is cleared here.
    const { submitting, errorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            onReset: () => {
                setUseSel(false)
                setSelStr('')
                setDensity(DEFAULT_DENSITY)
                setProbeRadius(DEFAULT_PROBE_RADIUS)
            },
            buildCommit: () => {
                if (objId === undefined) return null
                const effSelStr = useSel ? selStr : ''
                return {
                    invoke: () => cm!.invokeService('makeMolSurf', {
                        sceneId,
                        objId,
                        selStr: effSelStr,
                        surfName,
                        density,
                        probeRadius,
                    }),
                    onSuccess: () => {
                        if (effSelStr.trim() !== '') pushHistory(effSelStr.trim())
                        onConfirm({ ok: true })
                    },
                    fallbackError: 'Failed to generate molecular surface',
                }
            },
        })

    // Prefill the surface name with a unique `sf_<molname>` whenever the
    // dialog opens or the target molecule changes (UXP `makeSugName` /
    // `onObjBoxChanged`). User edits made afterwards are not clobbered because
    // this effect only re-runs on open / molecule change, not on keystrokes.
    useEffect(() => {
        if (!visible || !cm || objId === undefined) return
        let cancelled = false
        void (async () => {
            try {
                const res = await cm.invokeService('proposeMolSurfName', {
                    sceneId,
                    objId,
                })
                if (!cancelled && res?.name) setSurfName(res.name)
            } catch {
                // Best-effort prefill; leave the field as-is on failure.
            }
        })()
        return () => {
            cancelled = true
        }
    }, [visible, cm, sceneId, objId])

    return (
        <DialogShell
            visible={visible}
            title="Mol surface generation"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={objId === undefined}
            submitting={submitting}
            errorMsg={errorMsg}
        >
                    <FieldSection title="Target">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            selectedId={objId}
                            onChange={setObjId}
                        />
                        <Field label="Use selection" inline controlFirst>
                            <CheckboxField
                                checked={useSel}
                                onChange={setUseSel}
                                disabled={submitting || objId === undefined}
                            />
                        </Field>
                        <MolSelList
                            sceneID={sceneId}
                            molID={objId}
                            selectedSel={selStr}
                            onSelectedSelChange={setSelStr}
                            disabled={submitting || objId === undefined || !useSel}
                        />
                    </FieldSection>

                    <FieldSection title="Surface">
                        <Field label="Object name">
                            <TextField
                                value={surfName}
                                onChange={setSurfName}
                                placeholder="sf_<molecule>"
                                disabled={submitting}
                            />
                        </Field>
                        <SliderField
                            label="Point density (/A)"
                            value={density}
                            min={DENSITY_MIN}
                            max={DENSITY_MAX}
                            step={1}
                            onCommit={setDensity}
                            disabled={submitting}
                        />
                        <Field label="Probe radius (A)">
                            <NumericField
                                value={probeRadius}
                                onChange={setProbeRadius}
                                min={0.1}
                                max={10}
                                step={0.1}
                                slider={false}
                                disabled={submitting}
                            />
                        </Field>
                    </FieldSection>
        </DialogShell>
    )
}
