/**
 * @file components/dialogs/CalcApbsPotDialog.tsx
 * @description Modal that computes an electrostatic-potential map (`ElePotMap`)
 * by running pdb2pqr + APBS as external processes. Ports the UXP
 * `tools/apbs-calcpot.{xul,js}` dialog:
 *   - Target molecule (`MolPicker`) + optional atom selection (`MolSelList`).
 *   - Elepot object name (`TextField`; prefilled with a unique `pot_<molname>`
 *     via `proposeElepotName`, like UXP `makeSugName`).
 *   - Charge method (`SegmentField` PDB2PQR / Internal): pdb2pqr exposes a force
 *     field select; internal exposes a "Use hydrogen atoms" switch.
 *   - APBS options: non-linear PBE switch, temperature, grid spacing, and the
 *     water / protein dielectrics.
 *   - Start runs the `calcApbsStart` worker job; progress is shown inline and
 *     the dialog auto-closes on completion. Start toggles to Stop while running.
 *
 * Unlike UXP, the external executable paths live in the SettingsPane
 * (`ApbsConfigContext`); this dialog reads them via `useApbsConfig` and gates
 * Start (with an inline warning) when a required path is unset. It uses the
 * shared `DialogShell` frame with a `footerActions` override for the
 * Start / Stop / Close buttons (the frame, spacing and error line stay shared).
 */

import React, { useEffect, useState } from 'react'
import { Button, Callout, ProgressBar } from '@blueprintjs/core'
import { useCueMol } from '../../hooks/useCueMol'
import { useApbsConfig } from '../../contexts/ApbsConfigContext'
import { useCalcApbsJob, isApbsJobActive } from '../../hooks/useCalcApbsJob'
import {
    Field,
    FieldSection,
    NumericField,
    SegmentField,
    SelectField,
    CheckboxField,
    SwitchField,
    TextField,
} from '../../h3-kit/form'
import { DialogShell } from './DialogShell'
import { MolPicker } from './MolPicker'
import { MolSelList } from '../../h3-kit/MolSelList/MolSelList'
import { pushHistory } from '../../h3-kit/MolSelList/selHistory'
import {
    PDB2PQR_FORCE_FIELDS,
    type ApbsChargeMethod,
    type Pdb2pqrForceField,
} from '../../worker/shared/apbsTypes'

export interface CalcApbsPotDialogResult {
    ok: boolean
    newObjId?: number
    newObjName?: string
}

interface Props {
    visible: boolean
    sceneId: number
    onConfirm: (result: CalcApbsPotDialogResult) => void
    onCancel: () => void
}

// UXP XUL defaults.
const DEFAULT_TEMPERATURE = 298.15
const DEFAULT_GRID_SPACING = 1.0
const DEFAULT_WATER_DIELEC = 78.54
const DEFAULT_PROT_DIELEC = 2.0

export function CalcApbsPotDialog({
    visible, sceneId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { cm } = useCueMol()
    const { config: apbsConfig } = useApbsConfig()

    const [objId, setObjId] = useState<number | undefined>(undefined)
    const [useSel, setUseSel] = useState<boolean>(false)
    const [selStr, setSelStr] = useState<string>('')
    const [elepotName, setElepotName] = useState<string>('')
    const [chargeMethod, setChargeMethod] = useState<ApbsChargeMethod>('pdb2pqr')
    const [forceField, setForceField] = useState<Pdb2pqrForceField>('charmm')
    const [useHydrogen, setUseHydrogen] = useState<boolean>(false)
    const [useNpbe, setUseNpbe] = useState<boolean>(false)
    const [temperature, setTemperature] = useState<number>(DEFAULT_TEMPERATURE)
    const [gridSpacing, setGridSpacing] = useState<number>(DEFAULT_GRID_SPACING)
    const [waterDielec, setWaterDielec] = useState<number>(DEFAULT_WATER_DIELEC)
    const [protDielec, setProtDielec] = useState<number>(DEFAULT_PROT_DIELEC)

    const { job, start, cancel, reset } = useCalcApbsJob({
        cm,
        onComplete: (r) => {
            if (useSel && selStr.trim() !== '') pushHistory(selStr.trim())
            onConfirm({ ok: true, newObjId: r.newObjId, newObjName: r.newObjName })
        },
    })
    const running = isApbsJobActive(job)

    // Reset transient state on open (last-picked molecule persists, like
    // MakeMolSurfDialog). Reads the current default force field once at open;
    // deliberately keyed on `visible` only so later edits are not clobbered.
    useEffect(() => {
        if (!visible) return
        reset()
        setUseSel(false)
        setSelStr('')
        setChargeMethod('pdb2pqr')
        setForceField((apbsConfig.pdb2pqrFF as Pdb2pqrForceField) ?? 'charmm')
        setUseHydrogen(false)
        setUseNpbe(false)
        setTemperature(DEFAULT_TEMPERATURE)
        setGridSpacing(DEFAULT_GRID_SPACING)
        setWaterDielec(DEFAULT_WATER_DIELEC)
        setProtDielec(DEFAULT_PROT_DIELEC)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible])

    // Prefill the elepot name with a unique `pot_<molname>` on open / molecule
    // change (UXP `makeSugName` / `onObjBoxChanged`).
    useEffect(() => {
        if (!visible || !cm || objId === undefined) return
        let cancelled = false
        void (async () => {
            try {
                const res = await cm.invokeService('proposeElepotName', { sceneId, objId })
                if (!cancelled && res?.name) setElepotName(res.name)
            } catch {
                // Best-effort prefill; leave the field as-is on failure.
            }
        })()
        return () => {
            cancelled = true
        }
    }, [visible, cm, sceneId, objId])

    // --- Not-configured gate (exe paths live in Settings) ---
    const apbsExe = apbsConfig.apbsExe.trim()
    const pdb2pqrExe = apbsConfig.pdb2pqrExe.trim()
    const needsPdb2pqr = chargeMethod === 'pdb2pqr'
    const missingApbs = apbsExe === ''
    const missingPdb2pqr = needsPdb2pqr && pdb2pqrExe === ''
    const notConfigured = missingApbs || missingPdb2pqr
    const startDisabled = objId === undefined || notConfigured

    const missingList: string[] = []
    if (missingApbs) missingList.push('APBS')
    if (missingPdb2pqr) missingList.push('pdb2pqr')

    const handleStart = (): void => {
        if (objId === undefined || running) return
        void start({
            sceneId,
            objId,
            selStr: useSel ? selStr : '',
            elepotName,
            chargeMethod,
            forceField,
            useHydrogen,
            useNpbe,
            temperature,
            gridSpacing,
            waterDielec,
            protDielec,
            binaries: {
                apbsExe: apbsConfig.apbsExe,
                pdb2pqrExe: apbsConfig.pdb2pqrExe,
            },
        })
    }

    const controlsDisabled = running

    return (
        <DialogShell
            visible={visible}
            title="APBS electrostatic potential"
            width="xl"
            onCancel={onCancel}
            footerActions={
                <>
                    <Button onClick={onCancel} disabled={running}>
                        Close
                    </Button>
                    <Button
                        intent="primary"
                        onClick={running ? () => void cancel() : handleStart}
                        disabled={!running && startDisabled}
                    >
                        {running ? 'Stop' : 'Start'}
                    </Button>
                </>
            }
        >
                    {notConfigured && (
                        <Callout intent="warning" compact>
                            {`Set the ${missingList.join(' and ')} executable path${
                                missingList.length > 1 ? 's' : ''
                            } in Settings > Tools > APBS / PDB2PQR to run this tool.`}
                        </Callout>
                    )}

                    <FieldSection title="Target">
                        <MolPicker
                            cm={cm}
                            sceneId={sceneId}
                            label="Molecule"
                            selectedId={objId}
                            onChange={setObjId}
                        />
                        <Field label="Use selection" inline controlFirst>
                            <CheckboxField
                                checked={useSel}
                                onChange={setUseSel}
                                disabled={controlsDisabled || objId === undefined}
                            />
                        </Field>
                        <MolSelList
                            sceneID={sceneId}
                            molID={objId}
                            selectedSel={selStr}
                            onSelectedSelChange={setSelStr}
                            disabled={controlsDisabled || objId === undefined || !useSel}
                        />
                        <Field label="Elepot name">
                            <TextField
                                value={elepotName}
                                onChange={setElepotName}
                                placeholder="pot_<molecule>"
                                disabled={controlsDisabled}
                            />
                        </Field>
                    </FieldSection>

                    <FieldSection title="Charge method">
                        <SegmentField<ApbsChargeMethod>
                            value={chargeMethod}
                            onValueChange={setChargeMethod}
                            options={[
                                { label: 'Use PDB2PQR', value: 'pdb2pqr' },
                                { label: 'Use internal', value: 'internal' },
                            ]}
                        />
                        {chargeMethod === 'pdb2pqr' ? (
                            <Field label="Force field">
                                <SelectField
                                    value={forceField}
                                    onChange={(v) => setForceField(v as Pdb2pqrForceField)}
                                    disabled={controlsDisabled}
                                >
                                    {PDB2PQR_FORCE_FIELDS.map((ff) => (
                                        <option key={ff} value={ff}>
                                            {ff}
                                        </option>
                                    ))}
                                </SelectField>
                            </Field>
                        ) : (
                            <Field label="Use hydrogen atoms" inline>
                                <SwitchField
                                    checked={useHydrogen}
                                    onChange={setUseHydrogen}
                                    disabled={controlsDisabled}
                                />
                            </Field>
                        )}
                    </FieldSection>

                    <FieldSection title="APBS options">
                        <Field label="Solve non-linear PBE" inline>
                            <SwitchField
                                checked={useNpbe}
                                onChange={setUseNpbe}
                                disabled={controlsDisabled}
                            />
                        </Field>
                        <Field label="Temperature (K)">
                            <NumericField
                                value={temperature}
                                onChange={setTemperature}
                                min={0.1}
                                max={1000}
                                step={0.01}
                                slider={false}
                                disabled={controlsDisabled}
                            />
                        </Field>
                        <Field label="Max grid size (A)">
                            <NumericField
                                value={gridSpacing}
                                onChange={setGridSpacing}
                                min={0.1}
                                max={10}
                                step={0.1}
                                slider={false}
                                disabled={controlsDisabled}
                            />
                        </Field>
                        <Field label="Water dielectric">
                            <NumericField
                                value={waterDielec}
                                onChange={setWaterDielec}
                                min={0.1}
                                max={200}
                                step={0.01}
                                slider={false}
                                disabled={controlsDisabled}
                            />
                        </Field>
                        <Field label="Protein dielectric">
                            <NumericField
                                value={protDielec}
                                onChange={setProtDielec}
                                min={0.1}
                                max={200}
                                step={0.1}
                                slider={false}
                                disabled={controlsDisabled}
                            />
                        </Field>
                    </FieldSection>

                    {running && <ProgressBar intent="primary" />}
                    {running && job?.statusText && (
                        <div className="h3-dialog-hint">{job.statusText}</div>
                    )}
                    {job?.status === 'error' && job.error && (
                        <div className="h3-dialog-error">{job.error}</div>
                    )}
        </DialogShell>
    )
}
