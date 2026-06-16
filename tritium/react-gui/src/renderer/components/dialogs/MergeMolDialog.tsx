/**
 * @file components/dialogs/MergeMolDialog.tsx
 * @description Modal that merges (copies or moves) the selected atoms of one
 * molecule into another. Ports the UXP `tools/mol_merge.xul` + `mol_merge.js`
 * dialog:
 *   - "From": source molecule (`ObjectSelect`) + atom selection (`MolSelList`).
 *   - "To": destination molecule (`ObjectSelect`).
 *   - "Copy" switch: on = keep source atoms, off = move (delete from source).
 *   - OK commits via the `mergeMol` worker service under a single undo txn.
 *
 * The caller passes only `{ sceneId }`. The last-picked molecules persist
 * within the session because the ids are not reset on open. Merging a molecule
 * into itself is blocked (OK stays disabled).
 */

import React, { useState } from 'react'
import { useCueMol } from '../../hooks/useCueMol'
import { useMolEditCommit } from '../../hooks/useMolEditCommit'
import { Field, FieldSection, SwitchField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { MolPicker } from './MolPicker'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'

export interface MergeMolDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: MergeMolDialogResult) => void
    onCancel: () => void
}

export function MergeMolDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { cm } = useCueMol()

    const [fromObjId, setFromObjId] = useState<number | undefined>(undefined)
    const [toObjId, setToObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')
    const [copy, setCopy] = useState<boolean>(true)

    const sameMol =
        fromObjId !== undefined && fromObjId === toObjId

    // Commit handler + submitting/errorMsg state + reset-on-open. The molecule
    // ids are intentionally NOT reset (last-picked persists); `copy` resets to
    // true. The same-molecule case is already gated by a disabled OK button, so
    // buildCommit simply returns null for it.
    const { submitting, errorMsg, run: handleOk } =
        useMolEditCommit({
            cm,
            visible,
            onReset: () => {
                setSelStr('')
                setCopy(true)
            },
            buildCommit: () => {
                if (fromObjId === undefined || toObjId === undefined) return null
                if (fromObjId === toObjId) return null
                return {
                    invoke: () => cm!.invokeService('mergeMol', {
                        sceneId,
                        fromObjId,
                        toObjId,
                        selStr,
                        copy,
                    }),
                    onSuccess: () => {
                        if (selStr.trim() !== '') pushHistory(selStr.trim())
                        onConfirm({ ok: true })
                    },
                    fallbackError: 'Failed to merge molecule',
                }
            },
        })

    return (
        <DialogShell
            visible={visible}
            title="Merge molecule"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={
                fromObjId === undefined ||
                toObjId === undefined ||
                sameMol
            }
            submitting={submitting}
            errorMsg={errorMsg}
        >
                    <FieldSection title="From">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="From molecule"
                            selectedId={fromObjId}
                            onChange={setFromObjId}
                        />
                        <MolSelList
                            sceneID={sceneId}
                            molID={fromObjId}
                            selectedSel={selStr}
                            onSelectedSelChange={setSelStr}
                            disabled={submitting || fromObjId === undefined}
                        />
                    </FieldSection>

                    <FieldSection title="To">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="To molecule"
                            selectedId={toObjId}
                            onChange={setToObjId}
                        />
                        {sameMol && (
                            <div className="h3-dialog-hint">
                                Source and destination must be different molecules.
                            </div>
                        )}
                    </FieldSection>

                    <FieldSection title="Options">
                        <Field label="Copy (keep source atoms)" inline>
                            <SwitchField
                                checked={copy}
                                onChange={setCopy}
                                disabled={submitting}
                            />
                        </Field>
                    </FieldSection>
        </DialogShell>
    )
}
