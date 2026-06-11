/**
 * @file components/dialogs/MakeMolSurfDialog.tsx
 * @description Modal that builds a solvent-excluded molecular surface
 * (`MolSurfObj`) from a molecule. Ports the UXP `tools/makesurf.xul` +
 * `makesurf.js` dialog (built-in surface algorithm, not external MSMS):
 *   - Target molecule (`ObjectSelect`).
 *   - Optional atom selection (`SwitchField` enable + `MolSelList`).
 *   - Surface object name (`TextField`; blank -> worker picks `sf_<molname>`).
 *   - Point density (/A) and probe radius (A) numeric inputs.
 *   - OK commits via the `makeMolSurf` worker service under one undo txn.
 *
 * The caller passes only `{ sceneId }`. The last-picked molecule persists
 * within the session because the id is not reset on open. The UXP
 * regeneration mode is intentionally out of scope.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { Field, FieldSection, NumericField, SwitchField, TextField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'

export interface MakeMolSurfDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: MakeMolSurfDialogResult) => void
    onCancel: () => void
}

const DEFAULT_DENSITY = 10
const DEFAULT_PROBE_RADIUS = 1.4

export function MakeMolSurfDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [useSel, setUseSel] = useState<boolean>(false)
    const [selStr, setSelStr] = useState<string>('')
    const [surfName, setSurfName] = useState<string>('')
    const [density, setDensity] = useState<number>(DEFAULT_DENSITY)
    const [probeRadius, setProbeRadius] = useState<number>(DEFAULT_PROBE_RADIUS)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient state on each open. The molecule id is intentionally
    // NOT reset so the last-picked molecule persists within the session.
    useEffect(() => {
        if (!visible) return
        setUseSel(false)
        setSelStr('')
        setSurfName('')
        setDensity(DEFAULT_DENSITY)
        setProbeRadius(DEFAULT_PROBE_RADIUS)
        setSubmitting(false)
        setErrorMsg(null)
    }, [visible])

    const handleOk = useCallback(async () => {
        if (!cm || objId === undefined) return
        setSubmitting(true)
        setErrorMsg(null)
        const effSelStr = useSel ? selStr : ''
        try {
            const res = await cm.invokeService('makeMolSurf', {
                sceneId,
                objId,
                selStr: effSelStr,
                surfName,
                density,
                probeRadius,
            })
            setSubmitting(false)
            if (res?.ok) {
                if (effSelStr.trim() !== '') pushHistory(effSelStr.trim())
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to generate molecular surface')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, objId, useSel, selStr, surfName, density, probeRadius, onConfirm])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Mol surface generation"
            style={{ width: 380 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div className="h3-dialog-form">
                    <FieldSection title="Target">
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
                        <Field label="Use selection" inline>
                            <SwitchField
                                checked={useSel}
                                onChange={setUseSel}
                                disabled={submitting || objId === undefined}
                            />
                        </Field>
                        <MolSelList
                            sceneID={sceneId}
                            molID={objId}
                            selectedSel={selStr}
                            onSelectedSelChange={setSelStr}
                            disabled={submitting || objId === undefined || !useSel}
                        />
                    </FieldSection>

                    <FieldSection title="Surface">
                        <Field label="Object name">
                            <TextField
                                value={surfName}
                                onChange={setSurfName}
                                placeholder="sf_<molecule>"
                                disabled={submitting}
                            />
                        </Field>
                        <Field label="Point density (/A)">
                            <NumericField
                                value={density}
                                onChange={setDensity}
                                min={1}
                                max={50}
                                step={1}
                                slider={false}
                                disabled={submitting}
                            />
                        </Field>
                        <Field label="Probe radius (A)">
                            <NumericField
                                value={probeRadius}
                                onChange={setProbeRadius}
                                min={0.1}
                                max={10}
                                step={0.1}
                                slider={false}
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
