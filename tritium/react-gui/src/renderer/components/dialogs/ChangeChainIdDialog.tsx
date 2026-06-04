/**
 * @file components/dialogs/ChangeChainIdDialog.tsx
 * @description Modal that reassigns the chain ID of a selected set of
 * residues. Ports the UXP `tools/chg_chname.xul` + `chg_chname.js` dialog:
 *   - Molecule picker (`ObjectSelect`, MolCoord filter).
 *   - Atom-selection input (`MolSelList`).
 *   - New chain ID text field.
 *   - OK commits via the `changeChainName` worker service (which calls
 *     `MolAnlManager.changeChainName` under an undo txn).
 *
 * The caller passes only `{ sceneId }`; the molecule is chosen inside the
 * dialog. Built entirely from h3-kit/form widgets so sizing/labels follow
 * the form-kit catalog (no per-dialog spacing tuning).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { FieldSection, TextField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'

export interface ChangeChainIdDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: ChangeChainIdDialogResult) => void
    onCancel: () => void
}

export function ChangeChainIdDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')
    const [chainName, setChainName] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient state on each open -- the provider keeps the component
    // mounted across show/hide cycles, so leftover flags would otherwise stick.
    useEffect(() => {
        if (!visible) return
        setSelStr('')
        setChainName('')
        setSubmitting(false)
        setErrorMsg(null)
    }, [visible])

    const trimmed = chainName.trim()
    // PDB chain IDs are a single character; longer values are accepted (the C++
    // layer allows them) but flagged as non-conforming -- UXP shows a confirm.
    const lengthWarning = trimmed.length > 1

    const handleOk = useCallback(async () => {
        if (!cm || objId === undefined) return
        if (trimmed === '') {
            setErrorMsg('New chain ID is empty.')
            return
        }
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('changeChainName', {
                sceneId,
                objId,
                selStr,
                chainName: trimmed,
            })
            setSubmitting(false)
            if (res?.ok) {
                if (selStr.trim() !== '') pushHistory(selStr.trim())
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to change chain ID')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, objId, selStr, trimmed, onConfirm])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Change chain ID"
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

                    <FieldSection title="New chain ID">
                        <TextField
                            value={chainName}
                            onChange={(v) => {
                                setChainName(v)
                                if (errorMsg) setErrorMsg(null)
                            }}
                            placeholder="e.g. A"
                            disabled={submitting || objId === undefined}
                            invalid={errorMsg !== null && trimmed === ''}
                        />
                        {lengthWarning && (
                            <div className="h3-dialog-hint">
                                Chain ID longer than 1 character does not conform to the PDB format.
                            </div>
                        )}
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
                            disabled={submitting || objId === undefined || trimmed === ''}
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
