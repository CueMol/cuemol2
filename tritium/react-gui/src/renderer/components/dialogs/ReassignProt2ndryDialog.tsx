/**
 * @file components/dialogs/ReassignProt2ndryDialog.tsx
 * @description Modal that recomputes or manually assigns protein secondary
 * structure. Ports the UXP `tools/prot2ndry-tool` dialog:
 *   - Molecule picker (`ObjectSelect`, MolCoord filter).
 *   - Mode (`SegmentField`): Recalculate / Assign.
 *   - Recalculate: Ignore beta bulge + Helix gap-fill angle (deg).
 *   - Assign: atom selection (`MolSelList`) + secondary-structure type select.
 *   - OK commits via the `reassignProt2ndry` worker service under an undo txn.
 *
 * The caller passes only `{ sceneId }`; the molecule persists in-session
 * (objId is not reset on open).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { Field, FieldSection, NumericField, SegmentField, SelectField, SwitchField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'

export interface ReassignProt2ndryDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: ReassignProt2ndryDialogResult) => void
    onCancel: () => void
}

type Mode = 'recalc' | 'assign'

const MODE_OPTIONS: { label: string; value: Mode }[] = [
    { label: 'Recalculate', value: 'recalc' },
    { label: 'Assign', value: 'assign' },
]

export function ReassignProt2ndryDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [mode, setMode] = useState<Mode>('recalc')
    const [ignBulge, setIgnBulge] = useState(false)
    const [helixGapFill, setHelixGapFill] = useState(false)
    const [helixAngle, setHelixAngle] = useState(120)
    const [selStr, setSelStr] = useState('')
    const [secType, setSecType] = useState('0')
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient state on each open. objId persists in-session.
    useEffect(() => {
        if (!visible) return
        setMode('recalc')
        setIgnBulge(false)
        setHelixGapFill(false)
        setHelixAngle(120)
        setSelStr('')
        setSecType('0')
        setSubmitting(false)
        setErrorMsg(null)
    }, [visible])

    const recalcDisabled = mode !== 'recalc'
    const assignDisabled = mode !== 'assign'

    const handleOk = useCallback(async () => {
        if (!cm || objId === undefined) return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('reassignProt2ndry',
                mode === 'recalc'
                    ? {
                        sceneId, objId, mode,
                        ignBulge,
                        helixGapAngle: helixGapFill ? helixAngle : 0,
                    }
                    : {
                        sceneId, objId, mode,
                        selStr,
                        secType: Number(secType),
                    },
            )
            setSubmitting(false)
            if (res?.ok) {
                if (mode === 'assign' && selStr.trim() !== '') pushHistory(selStr.trim())
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to reassign secondary structure')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, objId, mode, ignBulge, helixGapFill, helixAngle, selStr, secType, onConfirm])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Reassign secondary structure"
            style={{ width: 400 }}
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

                    <FieldSection title="Mode">
                        <SegmentField<Mode>
                            value={mode}
                            onValueChange={setMode}
                            options={MODE_OPTIONS}
                        />
                    </FieldSection>

                    <FieldSection title="Recalculate">
                        <Field label="Ignore β bulge" inline>
                            <SwitchField
                                checked={ignBulge}
                                onChange={setIgnBulge}
                                disabled={submitting || recalcDisabled}
                            />
                        </Field>
                        <Field label="Helix gap-fill angle (°)" inline>
                            <SwitchField
                                checked={helixGapFill}
                                onChange={setHelixGapFill}
                                disabled={submitting || recalcDisabled}
                            />
                        </Field>
                        <Field label="Angle">
                            <NumericField
                                value={helixAngle}
                                onChange={setHelixAngle}
                                min={0}
                                max={180}
                                disabled={submitting || recalcDisabled || !helixGapFill}
                            />
                        </Field>
                    </FieldSection>

                    <FieldSection title="Assign">
                        <MolSelList
                            sceneID={sceneId}
                            molID={objId}
                            selectedSel={selStr}
                            onSelectedSelChange={setSelStr}
                            disabled={submitting || assignDisabled || objId === undefined}
                        />
                        <Field label="Type">
                            <SelectField
                                value={secType}
                                onChange={setSecType}
                                disabled={submitting || assignDisabled}
                            >
                                <option value="0">Coil</option>
                                <option value="1">β strand</option>
                                <option value="2">α helix</option>
                                <option value="3">3-10 helix</option>
                                <option value="4">π helix</option>
                            </SelectField>
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
        </Dialog>
    )
}
