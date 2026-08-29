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

import React, { useState } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolEditCommit } from '@renderer/hooks/cuemol/useMolEditCommit'
import { FieldSection } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { MolPicker } from './MolPicker'
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
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')

    const trimmedSel = selStr.trim()

    // Commit handler + submitting/errorMsg state + reset-on-open. objId is
    // intentionally NOT reset (last-picked molecule persists in-session).
    const { submitting, errorMsg, setErrorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            onReset: () => setSelStr(''),
            buildCommit: () => {
                if (objId === undefined || trimmedSel === '') return null
                return {
                    invoke: () => cm!.invokeService('deleteMolAtoms', {
                        sceneId,
                        objId,
                        selStr,
                    }),
                    onSuccess: () => {
                        pushHistory(trimmedSel)
                        onConfirm({ ok: true })
                    },
                    fallbackError: 'Failed to delete atoms',
                }
            },
        })

    return (
        <DialogShell
            visible={visible}
            title="Delete atoms"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okLabel="Delete"
            okIntent="danger"
            okDisabled={objId === undefined || trimmedSel === ''}
            submitting={submitting}
            errorMsg={errorMsg}
        >
                    <FieldSection title="Molecule">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            selectedId={objId}
                            onChange={setObjId}
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
        </DialogShell>
    )
}
