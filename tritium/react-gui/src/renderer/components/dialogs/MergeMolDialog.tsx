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

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { Field, FieldSection, SwitchField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
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
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [fromObjId, setFromObjId] = useState<number | undefined>(undefined)
    const [toObjId, setToObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')
    const [copy, setCopy] = useState<boolean>(true)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient state on each open. The molecule ids are intentionally
    // NOT reset so the last-picked molecules persist within the session.
    useEffect(() => {
        if (!visible) return
        setSelStr('')
        setCopy(true)
        setSubmitting(false)
        setErrorMsg(null)
    }, [visible])

    const sameMol =
        fromObjId !== undefined && fromObjId === toObjId

    const handleOk = useCallback(async () => {
        if (!cm || fromObjId === undefined || toObjId === undefined) return
        if (fromObjId === toObjId) {
            setErrorMsg('Source and destination molecules must differ.')
            return
        }
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('mergeMol', {
                sceneId,
                fromObjId,
                toObjId,
                selStr,
                copy,
            })
            setSubmitting(false)
            if (res?.ok) {
                if (selStr.trim() !== '') pushHistory(selStr.trim())
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to merge molecule')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, fromObjId, toObjId, selStr, copy, onConfirm])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Merge molecule"
            style={{ width: 380 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div className="h3-dialog-form">
                    <FieldSection title="From">
                        <ObjectSelect
                            cm={cm}
                            sceneId={sceneId}
                            label="From molecule"
                            filter={objectFilters.molCoord}
                            selectedId={fromObjId}
                            onChange={setFromObjId}
                            emptyText="(no molecules)"
                            fallbackName={(m) => `Mol ${m.uid}`}
                            hideLabel
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
                        <ObjectSelect
                            cm={cm}
                            sceneId={sceneId}
                            label="To molecule"
                            filter={objectFilters.molCoord}
                            selectedId={toObjId}
                            onChange={setToObjId}
                            emptyText="(no molecules)"
                            fallbackName={(m) => `Mol ${m.uid}`}
                            hideLabel
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
                            disabled={
                                submitting ||
                                fromObjId === undefined ||
                                toObjId === undefined ||
                                sameMol
                            }
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
