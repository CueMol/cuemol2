/**
 * @file components/dialogs/MolSuperposeDialog.tsx
 * @description Modal that superposes one molecule (moving) onto another
 * (reference). Ports the UXP `tools/ssm_sup.xul` + `ssm_sup.js` dialog:
 *   - Algorithm switch: Least-Square Fitting (LSQ) / Secondary Structure
 *     Matching (SSM).
 *   - Reference and Moving each pick a MolCoord (`ObjectSelect`) plus an
 *     atom selection (`MolSelList`).
 *   - "Auto recenter" fits the view onto the moving selection afterwards.
 *   - "Use xformMat property" stores the transform instead of applying it.
 *   - OK commits via the `superposeMol` worker service (which calls
 *     `MolAnlManager.superposeSSM1` / `superposeLSQ1` under an undo txn).
 *
 * Last-used molecule / algorithm / checkbox state is persisted to localStorage
 * (`molSuperposeHistory`); selection-string history flows through the shared
 * MolSelList store. The UXP "Write RMSD info file" option is not ported yet
 * (needs a native save dialog) -- see the superposition ADR.
 *
 * Built entirely from h3-kit/form widgets so sizing/labels follow the form-kit
 * catalog (no per-dialog spacing tuning).
 */

import React, { useEffect, useState } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolEditCommit } from '@renderer/hooks/cuemol/useMolEditCommit'
import { Field, FieldSection, SegmentField, SwitchField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { objectFilters } from '../../h3-kit/ObjectSelect'
import { MolPicker } from './MolPicker'
import { MolSelList, pushHistory } from '@renderer/h3-kit/MolSelList'
import type { SceneObjectEntry } from '../../worker/server/services/listSceneObjects.service'
import type { SuperposeAlgo } from '../../worker/server/services/superposeMol.service'
import {
    loadMolSuperposeHistory,
    saveMolSuperposeHistory,
} from './molSuperposeHistory'

export interface MolSuperposeDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    viewId: number
    onConfirm: (result: MolSuperposeDialogResult) => void
    onCancel: () => void
}

const ALGO_OPTIONS = [
    { label: 'Least-Square Fitting', value: 'LSQ' as const },
    { label: 'Secondary Structure Matching', value: 'SSM' as const },
]

export function MolSuperposeDialog({
    visible, sceneId, viewId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { cm } = useCueMol()

    const [algo, setAlgo] = useState<SuperposeAlgo>('LSQ')
    const [refObjId, setRefObjId] = useState<number | undefined>(undefined)
    const [movObjId, setMovObjId] = useState<number | undefined>(undefined)
    const [refSel, setRefSel] = useState<string>('')
    const [movSel, setMovSel] = useState<string>('')
    const [autoRecenter, setAutoRecenter] = useState<boolean>(true)
    const [useprop, setUseprop] = useState<boolean>(false)

    // On each open: restore history (algorithm / checkboxes) and compute the
    // initial molecule selection -- last-used uids when still present, else
    // ref=first / mov=second (UXP `onLoad` default). Selection strings start
    // empty; the user picks from the MolSelList history dropdown. This effect
    // owns its own field resets (and the async cancelled-flag fetch), so the
    // commit hook below is given no onReset -- it only clears submitting /
    // errorMsg on open.
    useEffect(() => {
        if (!visible) return
        setRefSel('')
        setMovSel('')

        const hist = loadMolSuperposeHistory()
        setAlgo(hist.algo)
        setAutoRecenter(hist.autoRecenter)
        setUseprop(hist.useprop)

        if (!cm) {
            setRefObjId(hist.refObjId)
            setMovObjId(hist.movObjId)
            return
        }
        let cancelled = false
        cm.invokeService('listSceneObjects', { sceneId })
            .then((res) => {
                if (cancelled) return
                const mols = (res?.objects ?? []).filter(objectFilters.molCoord)
                const uids = mols.map((m: SceneObjectEntry) => m.uid)
                const has = (id: number | undefined): boolean =>
                    id !== undefined && uids.includes(id)
                setRefObjId(has(hist.refObjId) ? hist.refObjId : uids[0])
                setMovObjId(
                    has(hist.movObjId)
                        ? hist.movObjId
                        : uids.length > 1
                          ? uids[1]
                          : uids[0],
                )
            })
            .catch(() => {
                if (cancelled) return
                setRefObjId(hist.refObjId)
                setMovObjId(hist.movObjId)
            })
        return () => {
            cancelled = true
        }
    }, [visible, cm, sceneId])

    const { submitting, errorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            buildCommit: () => {
                if (refObjId === undefined || movObjId === undefined) return null
                return {
                    invoke: () => cm!.invokeService('superposeMol', {
                        sceneId,
                        viewId,
                        algo,
                        refObjId,
                        refSel,
                        movObjId,
                        movSel,
                        useprop,
                        autoRecenter,
                    }),
                    onSuccess: () => {
                        if (refSel.trim() !== '') pushHistory(refSel.trim())
                        if (movSel.trim() !== '') pushHistory(movSel.trim())
                        saveMolSuperposeHistory({ refObjId, movObjId, algo, autoRecenter, useprop })
                        onConfirm({ ok: true })
                    },
                    fallbackError: 'Superposition failed',
                }
            },
        })

    const noMols = refObjId === undefined || movObjId === undefined

    return (
        <DialogShell
            visible={visible}
            title="Molecular superposition"
            width="2xl"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={noMols}
            submitting={submitting}
            errorMsg={errorMsg}
        >
                    <FieldSection title="Algorithm">
                        <SegmentField<SuperposeAlgo>
                            value={algo}
                            onValueChange={setAlgo}
                            options={ALGO_OPTIONS}
                        />
                    </FieldSection>

                    <FieldSection title="Reference">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            selectedId={refObjId}
                            onChange={setRefObjId}
                        />
                        <MolSelList
                            sceneID={sceneId}
                            molID={refObjId}
                            selectedSel={refSel}
                            onSelectedSelChange={setRefSel}
                            disabled={submitting || refObjId === undefined}
                        />
                    </FieldSection>

                    <FieldSection title="Moving">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            selectedId={movObjId}
                            onChange={setMovObjId}
                        />
                        <MolSelList
                            sceneID={sceneId}
                            molID={movObjId}
                            selectedSel={movSel}
                            onSelectedSelChange={setMovSel}
                            disabled={submitting || movObjId === undefined}
                        />
                    </FieldSection>

                    <Field label="Auto recenter" inline>
                        <SwitchField
                            checked={autoRecenter}
                            onChange={setAutoRecenter}
                            disabled={submitting}
                        />
                    </Field>
                    <Field label="Use xformMat property" inline>
                        <SwitchField
                            checked={useprop}
                            onChange={setUseprop}
                            disabled={submitting}
                        />
                    </Field>
        </DialogShell>
    )
}
