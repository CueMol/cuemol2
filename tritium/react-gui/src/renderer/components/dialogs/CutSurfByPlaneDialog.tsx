/**
 * @file components/dialogs/CutSurfByPlaneDialog.tsx
 * @description Modal that cuts a molecular surface (`MolSurfObj`) by the
 * current view's clipping plane. Ports the UXP `tools/surf-cutbyplane.xul` +
 * `surf-cutbyplane.js` dialog:
 *   - Target surface (`ObjectSelect`, MolSurfObj only).
 *   - Cross-section type (`SelectField`: Complete / Separately / Section only /
 *     No section -> full / separate / sect / body).
 *   - Section mesh density (/A).
 *   - OK commits via the `cutSurfByPlane` worker service under one undo txn;
 *     the worker derives the clip plane from the active view.
 *
 * The caller passes `{ sceneId, viewId }` (the plane is computed from the
 * view). The last-picked surface persists within the session.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import { Field, FieldSection, NumericField, SelectField } from '../../h3-kit/form'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import type { CutSurfMode } from '../../worker/server/services/cutSurfByPlane.service'

export interface CutSurfByPlaneDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    viewId: number
    onConfirm: (result: CutSurfByPlaneDialogResult) => void
    onCancel: () => void
}

const DEFAULT_DENSITY = 5.0

const MODE_OPTIONS: { value: CutSurfMode; label: string }[] = [
    { value: 'full', label: 'Complete' },
    { value: 'separate', label: 'Separately' },
    { value: 'sect', label: 'Section only' },
    { value: 'body', label: 'No section' },
]

export function CutSurfByPlaneDialog({
    visible, sceneId, viewId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [mode, setMode] = useState<CutSurfMode>('full')
    const [density, setDensity] = useState<number>(DEFAULT_DENSITY)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient state on each open. The surface id is intentionally NOT
    // reset so the last-picked surface persists within the session.
    useEffect(() => {
        if (!visible) return
        setMode('full')
        setDensity(DEFAULT_DENSITY)
        setSubmitting(false)
        setErrorMsg(null)
    }, [visible])

    const handleOk = useCallback(async () => {
        if (!cm || objId === undefined) return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('cutSurfByPlane', {
                sceneId,
                viewId,
                objId,
                mode,
                density,
            })
            setSubmitting(false)
            if (res?.ok) {
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to cut surface')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, viewId, objId, mode, density, onConfirm])

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Mol surface cutter"
            style={{ width: 380 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div className="h3-dialog-form">
                    <FieldSection title="Surface">
                        <Field label="Target surface">
                            <ObjectSelect
                                cm={cm}
                                sceneId={sceneId}
                                label="Target surface"
                                filter={objectFilters.molSurf}
                                selectedId={objId}
                                onChange={setObjId}
                                emptyText="(no surfaces)"
                                fallbackName={(m) => `Surf ${m.uid}`}
                                hideLabel
                            />
                        </Field>
                        <Field label="Cross section">
                            <SelectField
                                value={mode}
                                onChange={(v) => setMode(v as CutSurfMode)}
                                disabled={submitting}
                            >
                                {MODE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </SelectField>
                        </Field>
                        <Field label="Section mesh density (/A)">
                            <NumericField
                                value={density}
                                onChange={setDensity}
                                min={0.1}
                                max={50}
                                step={0.5}
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
