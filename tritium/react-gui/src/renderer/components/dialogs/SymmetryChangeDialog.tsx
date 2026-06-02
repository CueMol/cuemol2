/**
 * @file components/dialogs/SymmetryChangeDialog.tsx
 * @description Modal that edits an object's CrystalInfo. Ports the
 * UXP `tools/symm-chg-dlg.xul` + `symm-chg-dlg.js` dialog:
 *   - Crystal system dropdown -> populates space-group dropdown via
 *     `SymmOpManager.getSgNamesJSON`.
 *   - Restrict-by-symmetry checkbox enforces per-lattice cell
 *     constraints (UXP `restrCell`).
 *   - OK commits via `changeSymmetryInfo` worker service (which calls
 *     `SymmOpManager.changeXtalInfo` under an undo txn).
 *
 * The dialog owns its own initial-state fetch (`getSymmetryPanelInfo`)
 * so the caller only passes `{ sceneId, objId }`.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
    Button,
    Checkbox,
    Dialog,
    DialogBody,
    DialogFooter,
    FormGroup,
    HTMLSelect,
    InputGroup,
    NumericInput,
} from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '../../hooks/useCueMol'
import type {
    SpaceGroupEntry,
    SymmetryInfo,
} from '../../worker/server/services/symmetryPanelOps.service'

export type CrystalSystem =
    | 'TRICLINIC'
    | 'MONOCLINIC'
    | 'ORTHORHOMBIC'
    | 'TRIGONAL'
    | 'TETRAGONAL'
    | 'HEXAGONAL'
    | 'CUBIC'

const LATTICE_OPTIONS: { value: CrystalSystem; label: string }[] = [
    { value: 'TRICLINIC', label: 'Triclinic' },
    { value: 'MONOCLINIC', label: 'Monoclinic' },
    { value: 'ORTHORHOMBIC', label: 'Orthorhombic' },
    { value: 'TRIGONAL', label: 'Trigonal' },
    { value: 'TETRAGONAL', label: 'Tetragonal' },
    { value: 'HEXAGONAL', label: 'Hexagonal' },
    { value: 'CUBIC', label: 'Cubic' },
]

export interface SymmetryChangeDialogResult {
    ok: boolean
    /** Populated when ok=false. */
    error?: string
}

interface Props {
    visible: boolean
    sceneId: number
    objId: number
    onConfirm: (result: SymmetryChangeDialogResult) => void
    onCancel: () => void
}

interface CellState {
    a: number
    b: number
    c: number
    alpha: number
    beta: number
    gamma: number
}

interface RestrictResult {
    cell: CellState
    /** Which fields the lattice constraint locks for editing. */
    disabled: {
        a: boolean
        b: boolean
        c: boolean
        alpha: boolean
        beta: boolean
        gamma: boolean
    }
}

const ALL_FREE: RestrictResult['disabled'] = {
    a: false, b: false, c: false,
    alpha: false, beta: false, gamma: false,
}

/**
 * UXP `restrCell` port. When `restrict=false` returns the cell as-is
 * with no fields locked. When `restrict=true` derives both the
 * constrained values and the locked-field set from the crystal
 * system (and -- for HEXAGONAL/TRIGONAL -- the space-group label).
 */
function applyLatticeRestriction(
    cell: CellState,
    lattice: CrystalSystem,
    restrict: boolean,
    sgLabel: string,
): RestrictResult {
    if (!restrict) return { cell, disabled: { ...ALL_FREE } }

    switch (lattice) {
        case 'TRICLINIC':
            return { cell, disabled: { ...ALL_FREE } }

        case 'MONOCLINIC':
            return {
                cell: { ...cell, alpha: 90, gamma: 90 },
                disabled: { ...ALL_FREE, alpha: true, gamma: true },
            }

        case 'ORTHORHOMBIC':
            return {
                cell: { ...cell, alpha: 90, beta: 90, gamma: 90 },
                disabled: { ...ALL_FREE, alpha: true, beta: true, gamma: true },
            }

        case 'TETRAGONAL':
            return {
                cell: { ...cell, b: cell.a, alpha: 90, beta: 90, gamma: 90 },
                disabled: { ...ALL_FREE, b: true, alpha: true, beta: true, gamma: true },
            }

        case 'CUBIC':
            return {
                cell: { ...cell, b: cell.a, c: cell.a, alpha: 90, beta: 90, gamma: 90 },
                disabled: { ...ALL_FREE, b: true, c: true, alpha: true, beta: true, gamma: true },
            }

        case 'HEXAGONAL':
        case 'TRIGONAL': {
            // Rhombohedral (R) cell on H/R lattice: a=b=c, free angles.
            if (sgLabel.trim().startsWith('R')) {
                return {
                    cell: { ...cell, b: cell.a, c: cell.a },
                    disabled: { ...ALL_FREE, b: true, c: true },
                }
            }
            // Standard H lattice: a=b, alpha=beta=90, gamma=120.
            return {
                cell: { ...cell, b: cell.a, alpha: 90, beta: 90, gamma: 120 },
                disabled: { ...ALL_FREE, b: true, alpha: true, beta: true, gamma: true },
            }
        }
    }
}

const DEFAULT_INFO: SymmetryInfo = {
    lattice: 'TRICLINIC',
    hm_spacegroup: '',
    a: 1, b: 1, c: 1,
    alpha: 90, beta: 90, gamma: 90,
    nsg: 1,
}

export function SymmetryChangeDialog({
    visible, sceneId, objId, onConfirm, onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [lattice, setLattice] = useState<CrystalSystem>('TRICLINIC')
    const [sgItems, setSgItems] = useState<SpaceGroupEntry[]>([])
    const [nsg, setNsg] = useState<number>(1)
    const [restrict, setRestrict] = useState<boolean>(false)
    const [cell, setCell] = useState<CellState>({
        a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90,
    })
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    /** True once we know whether the object already has CrystalInfo. */
    const [loaded, setLoaded] = useState(false)
    /** Source-of-truth nsg from the C++ CrystalInfo on open; used by the
     *  "unchanged" short-circuit (UXP). */
    const [openInfo, setOpenInfo] = useState<SymmetryInfo | null>(null)

    // Fetch the initial CrystalInfo when the dialog opens.
    useEffect(() => {
        if (!visible || !cm) return
        let cancelled = false
        ;(async () => {
            // Reset transient flags from the previous open -- the dialog
            // component stays mounted across show/hide cycles (the Dialog
            // Provider only toggles `visible`), so leftover state would
            // otherwise stick to the next session (e.g. OK stuck in
            // loading after a successful commit).
            setLoaded(false)
            setSubmitting(false)
            setErrorMsg(null)
            try {
                const res = await cm.invokeService('getSymmetryPanelInfo', { sceneId, objId })
                if (cancelled) return
                const info = res?.info ?? DEFAULT_INFO
                setOpenInfo(res?.hasInfo ? info : null)
                setLattice((info.lattice as CrystalSystem) ?? 'TRICLINIC')
                setNsg(info.nsg)
                setCell({
                    a: info.a, b: info.b, c: info.c,
                    alpha: info.alpha, beta: info.beta, gamma: info.gamma,
                })
                setRestrict(false)
            } catch (err) {
                if (cancelled) return
                console.warn('getSymmetryPanelInfo failed:', err)
                setOpenInfo(null)
                setLattice('TRICLINIC')
                setNsg(1)
                setCell({ a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 })
                setRestrict(false)
            } finally {
                if (!cancelled) setLoaded(true)
            }
        })()
        return () => { cancelled = true }
    }, [visible, cm, sceneId, objId])

    // Populate space-group dropdown whenever lattice changes (or on open).
    useEffect(() => {
        if (!visible || !cm) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await cm.invokeService('getSpaceGroupNames', { lattice })
                if (cancelled) return
                const items = res?.items ?? []
                setSgItems(items)
                // Preserve nsg if still in the list; otherwise pick first.
                setNsg((prev) => {
                    if (items.some((i) => i.id === prev)) return prev
                    return items.length > 0 ? items[0].id : 1
                })
            } catch (err) {
                if (cancelled) return
                console.warn('getSpaceGroupNames failed:', err)
                setSgItems([])
            }
        })()
        return () => { cancelled = true }
    }, [visible, cm, lattice])

    // Apply lattice restriction after sgItems / restrict / lattice / cell-source change.
    const sgLabel = sgItems.find((i) => i.id === nsg)?.cname ?? ''
    const restricted = applyLatticeRestriction(cell, lattice, restrict, sgLabel)
    const displayCell = restricted.cell
    const disabled = restricted.disabled

    const numericFor = useCallback(
        (key: keyof CellState, label: string): React.ReactElement => (
            <FormGroup label={label} inline style={{ marginBottom: 4 }}>
                <NumericInput
                    value={displayCell[key]}
                    disabled={disabled[key] || submitting}
                    buttonPosition="none"
                    fill={false}
                    selectAllOnFocus
                    onValueChange={(v) => {
                        if (Number.isFinite(v)) {
                            setCell((prev) => ({ ...prev, [key]: v }))
                        }
                    }}
                />
            </FormGroup>
        ),
        [displayCell, disabled, submitting],
    )

    const isNear = (x: number, y: number, eps = 1e-3): boolean => Math.abs(x - y) < eps

    const handleOk = useCallback(async () => {
        if (!cm) return
        // Skip the round-trip if nothing changed (UXP parity).
        if (openInfo
            && openInfo.nsg === nsg
            && isNear(openInfo.a, displayCell.a)
            && isNear(openInfo.b, displayCell.b)
            && isNear(openInfo.c, displayCell.c)
            && isNear(openInfo.alpha, displayCell.alpha)
            && isNear(openInfo.beta, displayCell.beta)
            && isNear(openInfo.gamma, displayCell.gamma)) {
            onConfirm({ ok: true })
            return
        }

        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await cm.invokeService('changeSymmetryInfo', {
                sceneId,
                objId,
                a: displayCell.a,
                b: displayCell.b,
                c: displayCell.c,
                alpha: displayCell.alpha,
                beta: displayCell.beta,
                gamma: displayCell.gamma,
                nsg,
            })
            setSubmitting(false)
            if (res?.ok) {
                onConfirm({ ok: true })
            } else {
                setErrorMsg(res?.error ?? 'Failed to change symminfo')
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, sceneId, objId, displayCell, nsg, openInfo, onConfirm])

    const ready = loaded && sgItems.length > 0

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Symmetry"
            style={{ width: 440 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <fieldset style={{ padding: '8px 12px', marginBottom: 12 }}>
                    <legend style={{ padding: '0 4px' }}>Symmetry</legend>

                    <FormGroup label="Crystal system:" inline>
                        <HTMLSelect
                            className="h3-form-select"
                            value={lattice}
                            disabled={submitting}
                            onChange={(e) => setLattice(e.currentTarget.value as CrystalSystem)}
                            options={LATTICE_OPTIONS}
                        />
                    </FormGroup>

                    <FormGroup label="Space Group:" inline>
                        <HTMLSelect
                            className="h3-form-select"
                            value={nsg}
                            disabled={submitting || sgItems.length === 0}
                            onChange={(e) => setNsg(Number(e.currentTarget.value))}
                            options={sgItems.map((i) => ({ value: i.id, label: i.cname }))}
                        />
                    </FormGroup>

                    <Checkbox
                        label="Biomolecules only"
                        checked={false}
                        disabled
                    />

                    <FormGroup label="Space Group Number:" inline>
                        <InputGroup
                            value={String(nsg)}
                            readOnly
                            style={{ width: 80 }}
                        />
                    </FormGroup>
                </fieldset>

                <fieldset style={{ padding: '8px 12px' }}>
                    <legend style={{ padding: '0 4px' }}>Cell dimension</legend>

                    <Checkbox
                        label="Restrict by symmetry"
                        checked={restrict}
                        disabled={submitting}
                        onChange={(e) => setRestrict(e.currentTarget.checked)}
                        style={{ marginBottom: 8 }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16 }}>
                        {numericFor('a', 'a=')}
                        {numericFor('alpha', String.fromCharCode(0x03b1) + '=')}
                        {numericFor('b', 'b=')}
                        {numericFor('beta', String.fromCharCode(0x03b2) + '=')}
                        {numericFor('c', 'c=')}
                        {numericFor('gamma', String.fromCharCode(0x03b3) + '=')}
                    </div>
                </fieldset>

                {errorMsg !== null && (
                    <div style={{ color: 'var(--accent-red)', marginTop: 8 }}>
                        {errorMsg}
                    </div>
                )}
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
                        <Button
                            intent="primary"
                            onClick={handleOk}
                            disabled={!ready || submitting}
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
