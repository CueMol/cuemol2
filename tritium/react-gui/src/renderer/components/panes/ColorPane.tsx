/**
 * @file ColorPane.tsx
 * @description Colour-scheme editor pane for renderers.
 *
 * Mirrors the UXP coloring panel (`coloring-panel.xul`) at the per-deck
 * granularity tracked in `docs/migration/uxp-inventory/panels.md`:
 *
 *   - `panel.coloring.shell`        -- renderer selector + coloring-type
 *                                     dropdown chrome (this component). The
 *                                     "Paint coloring" row is a submenu of the
 *                                     scene's `*Paint` style presets (UXP
 *                                     `onPaintColShowing`), not a leaf item.
 *   - `panel.coloring.deck.paint`   -- Paint table (inline editor)
 *   - `panel.coloring.deck.solid`   -- defaultcolor picker
 *   - `panel.coloring.deck.undef`   -- "select a renderer" placeholder
 *   - `panel.coloring.deck.{cpk,rainbow,bfac,elepot,multigrad,script}`
 *                                   -- per-mode decks
 *
 * State flow:
 *   1. `usePaintCapableRenderers` lists candidate renderers for the active
 *      scene and refetches on object/renderer events.
 *   2. The user picks a renderer; `useRendererColoringState` fetches its
 *      coloring class + paint entries (or defaultcolor) and refetches on
 *      coloring / defaultcolor property changes.
 *   3. Mutations (mode switch, Paint Add/Delete/Move/Update, default-color
 *      change) round-trip through worker services; the event subscription
 *      then refetches and re-renders the deck.
 *
 * This pane is one of the components within the ExplorerView.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Menu, MenuItem, Popover } from '@blueprintjs/core'
import { PaneSectionHeader } from './PaneSectionHeader'
import { Field, SelectField } from '../../h3-kit/form'
import type { RendColoringId } from '@shared/types/sceneCtxMenu'
import type { ColoringTargetKind } from '../../worker/server/services/rendererColoring.service'
import type { SceneObjectEntry } from '../../worker/server/services/listSceneObjects.service'
import { ColorPickerProvider } from '@renderer/h3-kit/colorpicker'
import { MultiGradSection } from '../multigrad/MultiGradSection'
import { usePaintCapableRenderers } from '../../hooks/usePaintCapableRenderers'
import { usePaintColoringStyles } from '../../hooks/usePaintColoringStyles'
import { useRendererColoringState } from '../../hooks/useRendererColoringState'
import { useElePotMapObjects } from '../../hooks/useElePotMapObjects'
import { useMolCoordObjects } from '../../hooks/useMolCoordObjects'
import { IPC } from '@shared/ipcChannels'
import { useClipboardScope } from '../../hooks/useClipboardScope'
import { useCueMol } from '../../hooks/cuemol/useCueMol'
import { useActiveScene } from '../../state/workspace'
import {
    COLORING_MODE_ITEMS,
    PAINT_DECK_CLASS,
    PAINT_SUBMENU_ID,
    SOLID_DECK_CLASSES,
} from './colorPane/coloringModes'
import { makeKey, parseTargetKey, type TargetKey } from './colorPane/targetKey'
import { RendererSelector } from './colorPane/RendererSelector'
import { usePaintSelection } from './colorPane/usePaintSelection'
import { useColorPaneActions } from './colorPane/useColorPaneActions'
import { PaintTable } from './colorPane/PaintTable'
import {
    BfacDeck,
    CpkDeck,
    DeferredDeck,
    ElepotDeck,
    RainbowDeck,
    SolidDeck,
} from './colorPane/decks'

// ------------------------------------------------------------
// Component props
// ------------------------------------------------------------

interface ColorPaneProps {
    collapsed?: boolean
    onToggleCollapse?: () => void
}

// ------------------------------------------------------------
// Main component
// ------------------------------------------------------------


export const ColorPane: React.FC<ColorPaneProps> = ({ collapsed, onToggleCollapse }) => {
    const { cm } = useCueMol()
    const { activeSceneId: sceneId } = useActiveScene()

    const { renderers } = usePaintCapableRenderers({ cm, sceneId })

    // Selected row is stored as a key (`<kind>:<uid>`) so a single state
    // captures both the target kind and the C++ uid. Parsed at use sites.
    const [selectedKey, setSelectedKey] = useState<TargetKey | null>(null)
    const {
        selectedRow, selectedRows, setSelectedRow, toggleSelectedRow, selectRowRange,
    } = usePaintSelection()

    // Auto-select the first row when the list changes, and clear when the
    // active row disappears.
    useEffect(() => {
        if (renderers.length === 0) {
            setSelectedKey(null)
            return
        }
        setSelectedKey((prev) => {
            if (prev && renderers.some(
                (r) => makeKey(r.targetKind, r.rendId) === prev,
            )) {
                return prev
            }
            return makeKey(renderers[0].targetKind, renderers[0].rendId)
        })
    }, [renderers])

    // Reset paint-row selection when the active target changes.
    useEffect(() => {
        setSelectedRow(null)
    }, [selectedKey, setSelectedRow])

    // Whether the OS clipboard holds paint rows; gates the Paste button.
    // Electron has no clipboard-change event, so this is re-asked on mount
    // and on every window focus -- which is exactly the moment the user
    // comes back from copying rows in CueMol2 or another CueMol3 window.
    const [canPastePaint, setCanPastePaint] = useState(false)
    useEffect(() => {
        let cancelled = false
        const refresh = (): void => {
            window.electronAPI
                ?.invoke(IPC.CLIPBOARD_CUEMOL_PEEK)
                .then((res) => {
                    if (!cancelled) setCanPastePaint(res?.kind === 'paint')
                })
                .catch((err: unknown) =>
                    console.warn('clipboard peek failed:', err),
                )
        }
        refresh()
        window.addEventListener('focus', refresh)
        return () => {
            cancelled = true
            window.removeEventListener('focus', refresh)
        }
    }, [])

    const target = selectedKey ? parseTargetKey(selectedKey) : null

    // Parent mol uid for the currently-selected target. Forwarded to
    // PaintSelCell so MolSelList can populate its "current (<sel>)" preset
    // and surface molecule-scoped named sel defs.
    const parentMolId = useMemo(() => {
        if (target === null) return undefined
        const entry = renderers.find(
            (r) => r.targetKind === target.targetKind && r.rendId === target.id,
        )
        return entry?.objId
    }, [target, renderers])

    const { state } = useRendererColoringState({
        cm,
        sceneId,
        rendId: target?.id ?? null,
        targetKind: target?.targetKind,
    })

    const className = state?.className ?? ''
    const defaultColor = state?.defaultColor ?? ''
    const entries = state?.paintEntries ?? []
    const surfaceType = state?.surfaceType ?? ''
    const isSurface = surfaceType === 'molsurf' || surfaceType === 'dsurface' || surfaceType === 'dsurf2'
    const isElepotActive = isSurface && state?.colormode === 'potential'
    const multiGradCapable = state?.multiGradCapable === true
    const isMultiGradActive = multiGradCapable && state?.colormode === 'multigrad'
    // UXP `'coloring' in rend`: gates the Paint/CPK/Bfac/Rainbow/Reset items.
    const hasColoring = state?.hasColoring === true
    // Map renderers without a `coloring` property (contour / gpu_*) carry a
    // multi_grad gradient only, so none of the coloring-class decks apply.
    // The isosurf map renderer has `coloring` (MOLFANC) and is NOT in this
    // group -- it routes through the coloring-class decks like molsurf.
    const isMapRenderer = multiGradCapable && !hasColoring
    // MOLFANC (molecule colormode): the renderer colors by its reference
    // molecule (`target` property); show the "Coloring mol" selector.
    const molFancTarget = state?.molFancTarget
    const isMolFancActive =
        molFancTarget !== undefined && state?.colormode === 'molecule'

    // Fetch the ElePotMap object list only while the Elepot deck is active;
    // outside of that the dropdown is hidden and the listener would burn
    // cycles on unrelated object-add/remove events.
    const { objects: elePotObjects } = useElePotMapObjects({
        cm,
        sceneId,
        enabled: isElepotActive,
    })

    // Molecule list for the "Coloring mol" selector; fetched only while a
    // molecule-colormode renderer is selected (same gating as Elepot).
    const { objects: molObjects } = useMolCoordObjects({
        cm,
        sceneId,
        enabled: isMolFancActive,
    })

    // "Paint coloring" submenu entries (UXP `onPaintColShowing`): a renderer
    // gets the scene's `*Paint` style presets (Default / Woody / Red / ...),
    // applied as a style; an object has no `style` property so it only gets
    // the plain "Default" PaintColoring.
    const { styles: paintStyles } = usePaintColoringStyles({ cm, sceneId })
    const paintSubmenuItems = useMemo((): {
        key: string
        label: string
        coloringId: RendColoringId
    }[] => {
        if (target?.targetKind === 'object') {
            return [{ key: 'default', label: 'Default', coloringId: 'paint-type-paint' }]
        }
        return paintStyles.map((s) => ({
            key: s.name,
            label: s.label,
            coloringId: `style-${s.name}` as RendColoringId,
        }))
    }, [target?.targetKind, paintStyles])

    // -- Mutation handlers --
    const requireTarget = useCallback(
        (): {
            sceneId: number
            rendId: number
            targetKind: ColoringTargetKind
        } | null => {
            if (!cm || sceneId === undefined || target === null) return null
            return {
                sceneId,
                rendId: target.id,
                targetKind: target.targetKind,
            }
        },
        [cm, sceneId, target],
    )

    const {
        onSelectMode, onAddRow, onRemoveRow, onMoveRow, onRemoveAllRows,
        onClipboardTake, onPasteRows, onUpdateCell, onDefaultColorCommit,
        onSetColoringProp, onSetElepotProp, onSetColoringTarget,
    } = useColorPaneActions({
        cm, requireTarget, entries, selectedRow, selectedRows, setSelectedRow,
        setCanPastePaint,
    })

    // -- Deck routing --
    const renderDeck = (): React.ReactNode => {
        if (sceneId === undefined || target === null) {
            return (
                <div className="color-undef-deck">
                    <p>Select a target to edit coloring.</p>
                </div>
            )
        }
        if (state === null) {
            // Brief flash between renderer change and first fetch resolve.
            return <div className="color-undef-deck"><p>Loading...</p></div>
        }
        if (!state.ok) {
            return (
                <div className="color-undef-deck">
                    <p>Coloring is not available for this renderer.</p>
                </div>
            )
        }
        // Multi-gradient deck: routes on colormode (like Elepot) before the
        // coloring class -- a renderer in multigrad mode may carry a stale
        // coloring object that must not surface its deck.
        if (isMultiGradActive) {
            return (
                <div className="color-deck-scroll">
                    <div className="color-section-label">
                        Multi-gradient coloring:
                    </div>
                    <MultiGradSection
                        cm={cm}
                        sceneId={sceneId}
                        rendId={target.id}
                    />
                </div>
            )
        }
        // A map renderer without a `coloring` property (contour / gpu_*) has
        // no editable coloring outside multigrad mode (its solid color lives
        // in the Density map panel), so guide the user to the mode switch
        // instead of showing a wrong deck.
        if (isMapRenderer) {
            return (
                <div className="color-deck-scroll">
                    <p className="mg-guide-note">
                        This map renderer uses its solid color. Switch to
                        Multi-gradient coloring via the Coloring dropdown to
                        edit a gradient here.
                    </p>
                </div>
            )
        }
        // UXP `_setupData` routes surface + colormode==potential to the
        // Elepot deck before evaluating the coloring class, so do the same
        // here -- a surface may have a stale CPK/Rainbow coloring set when
        // it is in potential mode and that should not surface its deck.
        if (isElepotActive && state.elepotParams) {
            return (
                <ElepotDeck
                    params={state.elepotParams}
                    objects={elePotObjects}
                    onCommit={onSetElepotProp}
                />
            )
        }
        // MOLFANC (molecule colormode): the coloring-class decks below color
        // by the nearest atom of the reference molecule; show a selector for
        // it above the deck. Same sentinel-option shape as the Elepot
        // "Potential" selector so a stale / removed target stays visible.
        const molFancSelector = isMolFancActive ? (
            <Field label="Coloring mol" inline>
                <SelectField
                    value={molFancTarget}
                    disabled={molObjects.length === 0}
                    onChange={onSetColoringTarget}
                >
                    {molObjects.find((o) => o.name === molFancTarget) === undefined && (
                        <option value={molFancTarget}>
                            {molFancTarget || '(no molecule selected)'}
                        </option>
                    )}
                    {molObjects.map((o: SceneObjectEntry) => (
                        <option key={o.uid} value={o.name}>
                            {o.name}
                        </option>
                    ))}
                </SelectField>
            </Field>
        ) : null
        const renderClassDeck = (): React.ReactNode => {
            if (className === PAINT_DECK_CLASS) {
                return (
                    <PaintTable
                        entries={entries}
                        selectedIdx={selectedRow}
                        selectedIdxs={selectedRows}
                        onSelect={setSelectedRow}
                        onToggleSelect={toggleSelectedRow}
                        onSelectRange={selectRowRange}
                        onAdd={onAddRow}
                        onRemove={onRemoveRow}
                        onMoveUp={() => onMoveRow('up')}
                        onMoveDown={() => onMoveRow('down')}
                        onUpdate={onUpdateCell}
                        onRemoveAll={onRemoveAllRows}
                        onCut={() => onClipboardTake('cut')}
                        onCopy={() => onClipboardTake('copy')}
                        onPaste={onPasteRows}
                        canPaste={canPastePaint}
                        sceneId={sceneId}
                        molId={parentMolId}
                    />
                )
            }
            if (SOLID_DECK_CLASSES.has(className)) {
                return (
                    <SolidDeck
                        className={className}
                        defaultColor={defaultColor}
                        onCommit={onDefaultColorCommit}
                    />
                )
            }
            if (className === 'CPKColoring' && state.cpkColors) {
                return <CpkDeck colors={state.cpkColors} onCommit={onSetColoringProp} />
            }
            if (className === 'RainbowColoring' && state.rainbowParams) {
                return <RainbowDeck params={state.rainbowParams} onCommit={onSetColoringProp} />
            }
            if (className === 'BfacColoring' && state.bfacParams) {
                return <BfacDeck params={state.bfacParams} onCommit={onSetColoringProp} />
            }
            return <DeferredDeck className={className} />
        }
        return (
            <>
                {molFancSelector}
                {renderClassDeck()}
            </>
        )
    }

    // --- Edit-menu clipboard (Cmd+C / X / V over the paint deck) ---
    // Registered only while the Paint deck is the visible one: the other
    // decks have no rows to copy, and an idle registration would answer for
    // a panel that shows nothing to act on.
    useClipboardScope(
        'paint-deck',
        {
            cut: () => onClipboardTake('cut'),
            copy: () => onClipboardTake('copy'),
            paste: onPasteRows,
        },
        className === PAINT_DECK_CLASS,
    )

    // Also disabled while the first coloring-state fetch is in flight, so
    // the dropdown never opens with capability flags still unknown.
    const dropdownDisabled = target === null || state === null

    return (
        <ColorPickerProvider cm={cm} sceneId={sceneId}>
        <div className="sp-pane">
            <PaneSectionHeader
                title="Color"
                icon="ui.tint"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <div className="sp-pane-fill color-panel-body">
                    {/* Renderer selector + coloring-type dropdown -- panel.coloring.shell */}
                    <div className="color-shell-row">
                        <RendererSelector
                            renderers={renderers}
                            selectedKey={selectedKey}
                            onChange={setSelectedKey}
                        />
                        <Popover
                            disabled={dropdownDisabled}
                            placement="bottom-end"
                            content={
                                <Menu>
                                    {COLORING_MODE_ITEMS
                                        // UXP `setupColoringSelector` gates:
                                        // the Paint/CPK/Bfac/Rainbow/Solid/
                                        // Reset items require a `coloring`
                                        // property ('coloring' in rend), the
                                        // Multi-gradient item a `multi_grad`
                                        // property, and Electrostatic
                                        // potential additionally a surface
                                        // renderer. Map renderers without
                                        // `coloring` (contour / gpu_*) offer
                                        // only Multi-gradient; isosurf has
                                        // `coloring` (MOLFANC) and offers
                                        // the full paint set. "Paint coloring"
                                        // renders as a submenu of style
                                        // presets rather than a leaf item.
                                        .filter((it) =>
                                            it.multigradOnly
                                                ? multiGradCapable
                                                : it.surfaceOnly
                                                  ? hasColoring && isSurface
                                                  : hasColoring)
                                        .map((it, i) =>
                                            it.coloringId === PAINT_SUBMENU_ID ? (
                                                <MenuItem
                                                    key={i}
                                                    text={it.label}
                                                    disabled={paintSubmenuItems.length === 0}
                                                >
                                                    {paintSubmenuItems.map((s) => (
                                                        <MenuItem
                                                            key={s.key}
                                                            text={s.label}
                                                            onClick={() => onSelectMode(s.coloringId)}
                                                        />
                                                    ))}
                                                </MenuItem>
                                            ) : (
                                                <MenuItem
                                                    key={i}
                                                    text={
                                                        it.enabled
                                                            ? it.label
                                                            : `${it.label} (coming soon)`
                                                    }
                                                    disabled={!it.enabled}
                                                    onClick={() => {
                                                        if (it.enabled && it.coloringId) {
                                                            onSelectMode(it.coloringId)
                                                        }
                                                    }}
                                                />
                                            ),
                                        )}
                                </Menu>
                            }
                        >
                            <Button
                                small
                                className="h3-form-dropdown-caret"
                                rightIcon={<span className="h3-form-caret" aria-hidden />}
                                text="Coloring"
                                disabled={dropdownDisabled}
                            />
                        </Popover>
                    </div>

                    {/* Deck content -- panel.coloring.deck.* */}
                    {renderDeck()}
                </div>
            )}
        </div>
        </ColorPickerProvider>
    )
}