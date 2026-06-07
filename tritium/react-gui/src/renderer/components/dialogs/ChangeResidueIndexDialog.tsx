/**
 * @file components/dialogs/ChangeResidueIndexDialog.tsx
 * @description Modal that shifts or renumbers the residue index of a selected
 * set of residues. Ports the UXP `tools/chg_resindex.xul` + `chg_resindex.js`
 * dialog:
 *   - Molecule picker (`ObjectSelect`, MolCoord filter).
 *   - Atom-selection input (`MolSelList`).
 *   - Mode: "Shift by" (relative) / "Start from" (absolute) -- `SegmentField`.
 *   - Value (`TextField`, parsed as an integer -- mirrors UXP textbox+parseInt).
 *   - "Renumber" switch: on -> `renumResIndex`, off -> `shiftResIndex`.
 *   - OK commits via the `changeResidueIndex` worker service under an undo txn.
 *
 * The caller passes only `{ sceneId }`. The last-picked molecule persists
 * within the session because `objId` is not reset on open (the provider keeps
 * the component mounted).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { Field, FieldSection, SegmentField, SwitchField, TextField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'
import { resolveResIndexInput, type ResIndexMode } from './resIndexInput'

export interface ChangeResidueIndexDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: ChangeResidueIndexDialogResult) => void
    onCancel: () => void
}

const MODE_OPTIONS: { label: string; value: ResIndexMode }[] = [
    { label: 'Shift by', value: 'shift' },
    { label: 'Start from', value: 'start' },
]

export function ChangeResidueIndexDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')
    const [mode, setMode] = useState<ResIndexMode>('shift')
    const [valueStr, setValueStr] = useState<string>('1')
    const [renumber, setRenumber] = useState<boolean>(false)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [pendingCommit, setPendingCommit] =
        useState<{ value: number; message: string } | null>(null)

    // Reset transient state on each open. `objId` is intentionally NOT reset so
    // the last-picked molecule persists within the session.
    useEffect(() => {
        if (!visible) return
        setSelStr('')
        setMode('shift')
        setValueStr('1')
        setRenumber(false)
        setSubmitting(false)
        setErrorMsg(null)
        setPendingCommit(null)
    }, [visible])

    const commit = useCallback(async (value: number) => {
        if (!cm || objId === undefined) return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('changeResidueIndex', {
                sceneId,
                objId,
                selStr,
                bshift: mode === 'shift',
                value,
                renumber,
            })
            setSubmitting(false)
            if (res?.ok) {
                if (selStr.trim() !== '') pushHistory(selStr.trim())
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to change residue index')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, objId, selStr, mode, renumber, onConfirm])

    const handleOk = useCallback(() => {
        if (!cm || objId === undefined) return
        const res = resolveResIndexInput(mode, valueStr)
        switch (res.kind) {
            case 'invalid':
                setErrorMsg(res.message)
                return
            case 'pdb-warn':
                setPendingCommit({ value: res.value, message: res.message })
                return
            case 'ok':
                void commit(res.value)
                return
        }
    }, [cm, objId, mode, valueStr, commit])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Change residue index"
            style={{ width: 380 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div className="h3-dialog-form">
                    <FieldSection title="Molecule">
                        <ObjectSelect
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            filter={objectFilters.molCoord}
                            selectedId={objId}
                            onChange={setObjId}
                            emptyText="(no molecules)"
                            fallbackName={(m) => `Mol ${m.uid}`}
                            hideLabel
                        />
                    </FieldSection>

                    <FieldSection title="Selection">
                        <MolSelList
                            sceneID={sceneId}
                            molID={objId}
                            selectedSel={selStr}
                            onSelectedSelChange={setSelStr}
                            disabled={submitting || objId === undefined}
                        />
                    </FieldSection>

                    <FieldSection title="Residue index">
                        <SegmentField<ResIndexMode>
                            value={mode}
                            onValueChange={(v) => {
                                setMode(v)
                                if (errorMsg) setErrorMsg(null)
                            }}
                            options={MODE_OPTIONS}
                        />
                        <Field label={mode === 'shift' ? 'Shift by' : 'Start from'}>
                            <TextField
                                value={valueStr}
                                onChange={(v) => {
                                    setValueStr(v)
                                    if (errorMsg) setErrorMsg(null)
                                }}
                                disabled={submitting || objId === undefined}
                            />
                        </Field>
                        <Field label="Renumber" inline>
                            <SwitchField
                                checked={renumber}
                                onChange={setRenumber}
                                disabled={submitting || objId === undefined}
                            />
                        </Field>
                    </FieldSection>

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
                            disabled={submitting || objId === undefined}
                            loading={submitting}
                        >
                            OK
                        </Button>
                    </>
                }
            />
            <Alert
                isOpen={pendingCommit !== null}
                intent="primary"
                confirmButtonText="Yes"
                cancelButtonText="No"
                className={isDark ? 'bp5-dark' : undefined}
                onConfirm={() => {
                    const p = pendingCommit
                    setPendingCommit(null)
                    if (p) void commit(p.value)
                }}
                onCancel={() => setPendingCommit(null)}
            >
                {pendingCommit?.message}
            </Alert>
        </Dialog>
    )
}
