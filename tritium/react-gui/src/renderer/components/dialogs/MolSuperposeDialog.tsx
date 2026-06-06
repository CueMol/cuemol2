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

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { Field, FieldSection, SegmentField, SwitchField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'
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
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [algo, setAlgo] = useState<SuperposeAlgo>('LSQ')
    const [refObjId, setRefObjId] = useState<number | undefined>(undefined)
    const [movObjId, setMovObjId] = useState<number | undefined>(undefined)
    const [refSel, setRefSel] = useState<string>('')
    const [movSel, setMovSel] = useState<string>('')
    const [autoRecenter, setAutoRecenter] = useState<boolean>(true)
    const [useprop, setUseprop] = useState<boolean>(false)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // On each open: restore history (algorithm / checkboxes) and compute the
    // initial molecule selection -- last-used uids when still present, else
    // ref=first / mov=second (UXP `onLoad` default). Selection strings start
    // empty; the user picks from the MolSelList history dropdown.
    useEffect(() => {
        if (!visible) return
        setRefSel('')
        setMovSel('')
        setSubmitting(false)
        setErrorMsg(null)

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

    const handleOk = useCallback(async () => {
        if (!cm || refObjId === undefined || movObjId === undefined) return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('superposeMol', {
                sceneId,
                viewId,
                algo,
                refObjId,
                refSel,
                movObjId,
                movSel,
                useprop,
                autoRecenter,
            })
            setSubmitting(false)
            if (res?.ok) {
                if (refSel.trim() !== '') pushHistory(refSel.trim())
                if (movSel.trim() !== '') pushHistory(movSel.trim())
                saveMolSuperposeHistory({ refObjId, movObjId, algo, autoRecenter, useprop })
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Superposition failed')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, viewId, algo, refObjId, refSel, movObjId, movSel, useprop, autoRecenter, onConfirm])

    const noMols = refObjId === undefined || movObjId === undefined

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Molecular superposition"
            style={{ width: 420 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div className="h3-dialog-form">
                    <FieldSection title="Algorithm">
                        <SegmentField<SuperposeAlgo>
                            value={algo}
                            onValueChange={setAlgo}
                            options={ALGO_OPTIONS}
                        />
                    </FieldSection>

                    <FieldSection title="Reference">
                        <ObjectSelect
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            filter={objectFilters.molCoord}
                            selectedId={refObjId}
                            onChange={setRefObjId}
                            emptyText="(no molecules)"
                            fallbackName={(m) => `Mol ${m.uid}`}
                            hideLabel
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
                        <ObjectSelect
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            filter={objectFilters.molCoord}
                            selectedId={movObjId}
                            onChange={setMovObjId}
                            emptyText="(no molecules)"
                            fallbackName={(m) => `Mol ${m.uid}`}
                            hideLabel
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

                    {errorMsg !== null && (
                        <div className="h3-dialog-error">{errorMsg}</div>
                    )}
                </div>
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
                        <Button
                            intent="primary"
                            onClick={handleOk}
                            disabled={submitting || noMols}
                            loading={submitting}
                        >
                            OK
                        </Button>
                    </>
                }
            />
        </Dialog>
    )
}
