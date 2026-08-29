/**
 * @file components/panes/SymmetryPane.tsx
 * @description Side-panel surface that ports UXP `panel.symmetry`
 * (`uxp_gui/cuemol2/base/content/symmetry-panel.{xul,js}`).
 *
 * Contents:
 *   - Object selector filtered to MolCoord / DensityMap subclasses
 *   - Crystal info readout (lattice + space group + 6 cell params)
 *   - Toolbar buttons: Change... (modal), Symm mol (popover with
 *     20/50/100/200 A + Unit cell), Unit cell
 *
 * The Change... dialog (`SymmetryChangeDialog`) is invoked via
 * `useShowSymmetryChangeDialog`. Show-symm / show-unitcell actions
 * dispatch worker services that wrap the renderer creation in an
 * undo transaction (UXP parity).
 */

import React, { useCallback, useState } from 'react'
import {
    Button,
    ButtonGroup,
    Menu,
    MenuItem,
    Popover,
} from '@blueprintjs/core'
import { SectionHeader } from './SectionHeader'
import { useSymmetryPanel } from '../../hooks/useSymmetryPanel'
import { useShowSymmetryChangeDialog } from '../dialogs/SymmetryChangeDialogProvider'
import type { SymmRendererExtent } from '../../worker/server/services/symmetryPanelOps.service'
import { ObjectSelect, objectFilters } from '../../h3-kit/ObjectSelect'
import { fireService } from '../../utils/fireService'
import { useCueMol } from '../../hooks/cuemol/useCueMol'
import { useActiveScene } from '../../state/workspace'

interface SymmetryPaneProps {
    collapsed?: boolean
    onToggleCollapse?: () => void
}

/** UXP `panels.symm.formatNum`: fixed-2 decimals. */
function formatNum(n: number): string {
    return n.toFixed(2)
}

/**
 * UXP `panels.symm.formatSg` port. Splits the H-M space-group string
 * by spaces; for each remaining token of length 2 the second char is
 * rendered as a `<sub>` (e.g. "P 61" -> "P" "6" sub("1")). The first
 * token is wrapped in `<i>` to italicise the centring symbol.
 */
function formatSpaceGroup(sg: string): React.ReactNode {
    if (!sg) return null
    const tokens = sg.split(' ')
    const head = tokens.shift() ?? ''
    return (
        <>
            <i>{head}</i>
            {tokens.map((tok, i) => {
                if (tok.length === 2) {
                    return (
                        <span key={i}>
                            {' '}
                            {tok[0]}
                            <sub>{tok[1]}</sub>
                        </span>
                    )
                }
                return <span key={i}> {tok}</span>
            })}
        </>
    )
}

function latticeDisplay(lat: string): string {
    if (!lat) return 'Unknown'
    return lat[0] + lat.slice(1).toLowerCase()
}

export const SymmetryPane: React.FC<SymmetryPaneProps> = ({ collapsed, onToggleCollapse }) => {
    const { cm } = useCueMol()
    const { activeSceneId, activeMolViewId } = useActiveScene()

    const [selectedObjId, setSelectedObjId] = useState<number | undefined>(undefined)
    const {
        info,
        hasInfo,
        isMol,
        cellOk,
        objectExists,
        refetch,
    } = useSymmetryPanel({ cm, sceneId: activeSceneId, objId: selectedObjId })

    const showChange = useShowSymmetryChangeDialog()

    const onChange = useCallback(async () => {
        if (selectedObjId === undefined || activeSceneId === undefined) return
        const res = await showChange({ sceneId: activeSceneId, objId: selectedObjId })
        if (res?.ok) refetch()
    }, [showChange, activeSceneId, selectedObjId, refetch])

    const onShowSymm = useCallback(
        (extent: SymmRendererExtent) => {
            if (!cm
                || activeSceneId === undefined
                || activeMolViewId === undefined
                || selectedObjId === undefined) return
            fireService(cm, 'showSymmRenderer', {
                sceneId: activeSceneId,
                objId: selectedObjId,
                viewId: activeMolViewId,
                extent,
            })
        },
        [cm, activeSceneId, activeMolViewId, selectedObjId],
    )

    const onShowUnitCell = useCallback(() => {
        if (!cm || activeSceneId === undefined || selectedObjId === undefined) return
        fireService(cm, 'showUnitCellRenderer', {
            sceneId: activeSceneId,
            objId: selectedObjId,
        })
    }, [cm, activeSceneId, selectedObjId])

    // Button enablement mirrors UXP `setDisabled` / `updateWidget`:
    //   - No object / no CrystalInfo            -> only Change... enabled
    //     (when the object exists; it lets the user attach fresh info)
    //   - Cell too small                          -> Symm mol + Unit cell off
    //   - Object is not MolCoord                  -> Symm mol off, Change... off
    const changeEnabled = objectExists && isMol
    const symmEnabled = hasInfo && cellOk && isMol
    const unitcellEnabled = hasInfo && cellOk

    const symmMolMenu = (
        <Menu>
            <MenuItem text="20 Å" onClick={() => onShowSymm(20)} />
            <MenuItem text="50 Å" onClick={() => onShowSymm(50)} />
            <MenuItem text="100 Å" onClick={() => onShowSymm(100)} />
            <MenuItem text="200 Å" onClick={() => onShowSymm(200)} />
            <MenuItem text="Unit cell" onClick={() => onShowSymm('unitcell')} />
        </Menu>
    )

    return (
        <div className="sp-pane">
            <SectionHeader
                title="Symmetry"
                icon="ui.cube"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <div className="sp-pane-fill">
                    <ObjectSelect
                        cm={cm}
                        sceneId={activeSceneId}
                        label="Object"
                        filter={objectFilters.molCoordOrDensityMap}
                        selectedId={selectedObjId}
                        onChange={setSelectedObjId}
                        emptyText="(no objects)"
                    />

                    <div style={{ fontSize: 'var(--fs-lg)' }}>
                        {latticeDisplay(info?.lattice ?? '')}
                        {info && info.hm_spacegroup ? (
                            <>
                                , S.g.:{' '}
                                {formatSpaceGroup(info.hm_spacegroup)}
                            </>
                        ) : (
                            ''
                        )}
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            columnGap: 6,
                            rowGap: 2,
                            fontSize: 'var(--fs-lg)',
                        }}
                    >
                        <span>
                            <i>a</i>= {info ? `${formatNum(info.a)} Å` : '-'}
                        </span>
                        <span>
                            <i>b</i>= {info ? `${formatNum(info.b)} Å` : '-'}
                        </span>
                        <span>
                            <i>c</i>= {info ? `${formatNum(info.c)} Å` : '-'}
                        </span>
                        <span>
                            {String.fromCharCode(0x03b1)}={' '}
                            {info ? `${formatNum(info.alpha)}°` : '-'}
                        </span>
                        <span>
                            {String.fromCharCode(0x03b2)}={' '}
                            {info ? `${formatNum(info.beta)}°` : '-'}
                        </span>
                        <span>
                            {String.fromCharCode(0x03b3)}={' '}
                            {info ? `${formatNum(info.gamma)}°` : '-'}
                        </span>
                    </div>

                    <ButtonGroup>
                        <Button small onClick={onChange} disabled={!changeEnabled}>
                            Change ...
                        </Button>
                        <Popover content={symmMolMenu} placement="bottom-start" disabled={!symmEnabled}>
                            <Button
                                small
                                className="h3-form-dropdown-caret"
                                rightIcon={<span className="h3-form-caret" aria-hidden />}
                                disabled={!symmEnabled}
                            >
                                Symm mol
                            </Button>
                        </Popover>
                        <Button small onClick={onShowUnitCell} disabled={!unitcellEnabled}>
                            Unit cell
                        </Button>
                    </ButtonGroup>
                </div>
            )}
        </div>
    )
}
