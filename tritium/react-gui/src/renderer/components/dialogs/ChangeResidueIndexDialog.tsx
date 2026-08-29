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

import React, { useCallback, useRef, useState } from 'react'
import { Alert } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolEditCommit } from '@renderer/hooks/cuemol/useMolEditCommit'
import { Field, FieldSection, SegmentField, SwitchField, TextField } from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { MolPicker } from './MolPicker'
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
    const [pendingCommit, setPendingCommit] =
        useState<{ value: number; message: string } | null>(null)
    // Resolved residue-index value for the next commit (set just before run()).
    const commitValueRef = useRef<number>(0)

    // Commit handler + submitting/errorMsg state + reset-on-open. `objId` is
    // intentionally NOT reset so the last-picked molecule persists in-session.
    // `run()` is multi-site callable: both handleOk (kind 'ok') and the confirm
    // Alert invoke it.
    const { submitting, errorMsg, setErrorMsg, run } =
        useMolEditCommit({
            cm,
            visible,
            onReset: () => {
                setSelStr('')
                setMode('shift')
                setValueStr('1')
                setRenumber(false)
                setPendingCommit(null)
            },
            buildCommit: () => {
                if (objId === undefined) return null
                const value = commitValueRef.current
                return {
                    invoke: () => cm!.invokeService('changeResidueIndex', {
                        sceneId,
                        objId,
                        selStr,
                        bshift: mode === 'shift',
                        value,
                        renumber,
                    }),
                    onSuccess: () => {
                        if (selStr.trim() !== '') pushHistory(selStr.trim())
                        onConfirm({ ok: true })
                    },
                    fallbackError: 'Failed to change residue index',
                }
            },
        })

    // Run a commit for the resolved residue-index value (sets the ref first).
    const commit = useCallback((value: number) => {
        commitValueRef.current = value
        void run()
    }, [run])

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
                commit(res.value)
                return
        }
    }, [cm, objId, mode, valueStr, commit, setErrorMsg])

    return (
        <DialogShell
            visible={visible}
            title="Change residue index"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={objId === undefined}
            submitting={submitting}
            errorMsg={errorMsg}
            extra={
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
        </DialogShell>
    )
}
