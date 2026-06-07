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
import { Alert, Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { FieldSection, TextField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'
import { resolveChainNameInput } from './chainNameInput'

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
    // Pending confirm before commit (blank-chain / non-conforming length).
    const [pendingCommit, setPendingCommit] =
        useState<{ value: string; message: string } | null>(null)

    // Reset transient state on each open -- the provider keeps the component
    // mounted across show/hide cycles, so leftover flags would otherwise stick.
    // `objId` is intentionally NOT reset so the last-picked molecule persists
    // within the session (UXP `_frommol` history, but session-scoped).
    useEffect(() => {
        if (!visible) return
        setSelStr('')
        setChainName('')
        setSubmitting(false)
        setErrorMsg(null)
        setPendingCommit(null)
    }, [visible])

    const trimmed = chainName.trim()
    // PDB chain IDs are a single character; longer values are accepted (the C++
    // layer allows them) but flagged as non-conforming -- UXP shows a confirm.
    const lengthWarning = trimmed.length > 1

    // Commit the resolved chain ID via the worker service. `name` is the value
    // produced by `resolveChainNameInput` (e.g. "_" for a blank chain).
    const commit = useCallback(async (name: string) => {
        if (!cm || objId === undefined) return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('changeChainName', {
                sceneId,
                objId,
                selStr,
                chainName: name,
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
    }, [cm, sceneId, objId, selStr, onConfirm])

    const handleOk = useCallback(() => {
        if (!cm || objId === undefined) return
        const res = resolveChainNameInput(chainName)
        switch (res.kind) {
            case 'empty':
                setErrorMsg('New chain ID is empty.')
                return
            case 'blank':
                setPendingCommit({
                    value: res.value,
                    message: 'Chain ID < > will be converted to <_>. Change the chain ID?',
                })
                return
            case 'long':
                setPendingCommit({
                    value: res.value,
                    message: 'Chain ID longer than 1 character does not conform to the PDB format. Change the chain ID?',
                })
                return
            case 'ok':
                void commit(res.value)
                return
        }
    }, [cm, objId, chainName, commit])

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
                            disabled={submitting || objId === undefined || chainName === ''}
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
