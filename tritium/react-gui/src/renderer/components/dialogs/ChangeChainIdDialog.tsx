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

import React, { useCallback, useRef, useState } from 'react'
import { Alert } from '@blueprintjs/core'
import { useDarkPortalClass } from '@renderer/h3-kit/primitives'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolEditCommit } from '@renderer/hooks/cuemol/useMolEditCommit'
import { FieldSection, TextField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { MolPicker } from './MolPicker'
import { MolSelList, pushHistory } from '@renderer/h3-kit/MolSelList'
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
    // The confirm Alert is its own portal, so it needs the theme class too.
    const portalClassName = useDarkPortalClass()
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [selStr, setSelStr] = useState<string>('')
    const [chainName, setChainName] = useState<string>('')
    // Pending confirm before commit (blank-chain / non-conforming length).
    const [pendingCommit, setPendingCommit] =
        useState<{ value: string; message: string } | null>(null)
    // Resolved chain ID for the next commit. Set by handleOk / the Alert just
    // before calling run(); buildCommit reads it (the value is derived, not a
    // form field, so it is carried via a ref rather than state).
    const commitValueRef = useRef<string>('')

    const trimmed = chainName.trim()
    // PDB chain IDs are a single character; longer values are accepted (the C++
    // layer allows them) but flagged as non-conforming -- UXP shows a confirm.
    const lengthWarning = trimmed.length > 1

    // Commit handler + submitting/errorMsg state + reset-on-open. `objId` is
    // intentionally NOT reset so the last-picked molecule persists in-session
    // (UXP `_frommol` history, session-scoped). `run()` is multi-site callable:
    // both handleOk (kind 'ok') and the confirm Alert invoke it.
    const { submitting, errorMsg, setErrorMsg, run } =
        useMolEditCommit({
            cm,
            visible,
            onReset: () => {
                setSelStr('')
                setChainName('')
                setPendingCommit(null)
            },
            buildCommit: () => {
                if (objId === undefined) return null
                const name = commitValueRef.current
                return {
                    invoke: () => cm!.invokeService('changeChainName', {
                        sceneId,
                        objId,
                        selStr,
                        chainName: name,
                    }),
                    onSuccess: () => {
                        if (selStr.trim() !== '') pushHistory(selStr.trim())
                        onConfirm({ ok: true })
                    },
                    fallbackError: 'Failed to change chain ID',
                }
            },
        })

    // Run a commit for the resolved chain-ID value (sets the ref first).
    const commit = useCallback((name: string) => {
        commitValueRef.current = name
        void run()
    }, [run])

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
                commit(res.value)
                return
        }
    }, [cm, objId, chainName, commit, setErrorMsg])

    return (
        <DialogShell
            visible={visible}
            title="Change chain ID"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={objId === undefined || chainName === ''}
            submitting={submitting}
            errorMsg={errorMsg}
            extra={
                <Alert
                    isOpen={pendingCommit !== null}
                    intent="primary"
                    confirmButtonText="Yes"
                    cancelButtonText="No"
                    className={portalClassName}
                    onConfirm={() => {
                        const p = pendingCommit
                        setPendingCommit(null)
                        if (p) void commit(p.value)
                    }}
                    onCancel={() => setPendingCommit(null)}
                >
                    {pendingCommit?.message}
                </Alert>
            }
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
        </DialogShell>
    )
}
