/**
 * @file components/dialogs/DeleteMolDialog.tsx
 * @description Modal that deletes the selected atoms of a molecule. Ports the
 * UXP `tools/mol_delete.xul` + `mol_delete.js` dialog:
 *   - Molecule picker (`ObjectSelect`, MolCoord filter).
 *   - Atom-selection input (`MolSelList`).
 *   - OK commits via the `deleteMolAtoms` worker service (which calls
 *     `MolAnlManager.deleteAtoms` under an undo txn).
 *
 * The caller passes only `{ sceneId }`; the molecule is chosen inside the
 * dialog. Built entirely from h3-kit/form widgets so sizing/labels follow
 * the form-kit catalog (no per-dialog spacing tuning).
 *
 * An explicit, non-empty selection is required: an empty expression would
 * select (and delete) every atom, which is destructive, so OK stays disabled
 * until something is selected.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { FieldSection } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'

export interface DeleteMolDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: DeleteMolDialogResult) => void
    onCancel: () => void
}

export function DeleteMolDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient state on each open -- the provider keeps the component
    // mounted across show/hide cycles, so leftover flags would otherwise stick.
    useEffect(() => {
        if (!visible) return
        setSelStr('')
        setSubmitting(false)
        setErrorMsg(null)
    }, [visible])

    const trimmedSel = selStr.trim()

    const handleOk = useCallback(async () => {
        if (!cm || objId === undefined || trimmedSel === '') return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('deleteMolAtoms', {
                sceneId,
                objId,
                selStr,
            })
            setSubmitting(false)
            if (res?.ok) {
                pushHistory(trimmedSel)
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to delete atoms')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, objId, selStr, trimmedSel, onConfirm])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Delete atoms"
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
                            onSelectedSelChange={(v) => {
                                setSelStr(v)
                                if (errorMsg) setErrorMsg(null)
                            }}
                            disabled={submitting || objId === undefined}
                        />
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
                            intent="danger"
                            onClick={handleOk}
                            disabled={submitting || objId === undefined || trimmedSel === ''}
                            loading={submitting}
                        >
                            Delete
                        </Button>
                    </>
                }
            />
        </Dialog>
    )
}
