/**
 * @file ViewPane.tsx
 * @description View / camera-transform pane (UXP `panel.fakedial` port).
 *
 * Three transform sections -- Rotation, Translation, Zoom/Slab -- plus a
 * Projection section for the View display attributes that already have menu
 * commands (perspective, center mark). Background colour is a Scene property,
 * not a View property, so it is intentionally not surfaced here.
 *
 * The fake-dial rotary UX is reproduced with `DragNumericField` used WITHOUT
 * bounds (Blender-style unbounded horizontal drag, no fill bar): one field
 * replaces each UXP wheel + textbox pair. Transform values live in
 * `useViewXform`; rotation is relative (each drag delta is applied via
 * `rotateView` and the field accumulator resets on release). The Projection
 * controls are driven by props sourced from `useActiveViewState` and written
 * through the existing view commands, so that hook stays the single source of
 * truth and the native menu stays in sync. See ADR-0025.
 *
 * This pane is one of the components within the Explorer view.
 */

import React, { useRef, useState } from 'react'
import { SectionHeader } from './SectionHeader'
import { FieldSection, FieldGrid, FieldGridRow, DragNumericField, SwitchField, SelectField } from '../../h3-kit/form'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { ViewCenterMark } from '../../../shared/ipcTypes'
import { useViewXform, type CenterAxis } from '../../hooks/useViewXform'

export interface ViewPaneProps {
    cm: AsyncCueMol | null
    activeSceneId: number | undefined
    activeMolViewId: number | undefined
    collapsed?: boolean
    onToggleCollapse?: () => void
    /* --- View attributes (current values owned by useActiveViewState) --- */
    viewProjection: boolean | null
    viewCenterMark: ViewCenterMark | null
    onSetPerspective: (perspective: boolean) => void
    onSetCenterMark: (mark: ViewCenterMark) => void
}

/**
 * A single rotation axis control. Rotation has no absolute scalar, so the
 * field shows a transient accumulator: each `onChange` applies the delta from
 * the previous frame via `onRotate`, and the value resets to 0 when the drag
 * (or text edit) ends -- mirroring the UXP wheel's reset-on-release textbox.
 */
const RotationField: React.FC<{
    axis: CenterAxis
    disabled: boolean
    onRotate: (axis: CenterAxis, deltaDeg: number) => void
    onBegin: () => void
    onEnd: () => void
}> = ({ axis, disabled, onRotate, onBegin, onEnd }) => {
    const [val, setVal] = useState(0)
    const prevRef = useRef(0)
    const reset = (): void => {
        setVal(0)
        prevRef.current = 0
        onEnd()
    }
    return (
        <DragNumericField
            value={val}
            unit="deg"
            step={1}
            decimals={0}
            disabled={disabled}
            realtime
            onDragStart={() => {
                prevRef.current = val
                onBegin()
            }}
            onChange={(v) => {
                const delta = v - prevRef.current
                prevRef.current = v
                if (delta !== 0) onRotate(axis, delta)
                setVal(v)
            }}
            onRelease={reset}
            onDragCancel={reset}
        />
    )
}

export const ViewPane: React.FC<ViewPaneProps> = ({
    cm,
    activeSceneId,
    activeMolViewId,
    collapsed = false,
    onToggleCollapse,
    viewProjection,
    viewCenterMark,
    onSetPerspective,
    onSetCenterMark,
}) => {
    const xform = useViewXform({ cm, sceneId: activeSceneId, viewId: activeMolViewId })
    const st = xform.state
    const noView = !st
    const begin = xform.beginInteraction
    const end = xform.endInteraction

    return (
        <div className="sp-pane view-pane">
            <SectionHeader
                title="View"
                icon="ui.camera"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <div className="sp-pane-scroll view-pane-body">
                    <FieldSection title="Rotation">
                        <FieldGrid>
                            <FieldGridRow label="RotX">
                                <RotationField axis="x" disabled={noView} onRotate={xform.rotate} onBegin={begin} onEnd={end} />
                            </FieldGridRow>
                            <FieldGridRow label="RotY">
                                <RotationField axis="y" disabled={noView} onRotate={xform.rotate} onBegin={begin} onEnd={end} />
                            </FieldGridRow>
                            <FieldGridRow label="RotZ">
                                <RotationField axis="z" disabled={noView} onRotate={xform.rotate} onBegin={begin} onEnd={end} />
                            </FieldGridRow>
                        </FieldGrid>
                    </FieldSection>

                    <FieldSection title="Translation">
                        <FieldGrid>
                            <FieldGridRow label="TraX">
                                <DragNumericField
                                    value={st?.centerX ?? 0}
                                    unit="A"
                                    step={0.1}
                                    decimals={2}
                                    disabled={noView}
                                    realtime
                                    onDragStart={begin}
                                    onChange={(v) => xform.setCenter('x', v)}
                                    onRelease={end}
                                    onDragCancel={end}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="TraY">
                                <DragNumericField
                                    value={st?.centerY ?? 0}
                                    unit="A"
                                    step={0.1}
                                    decimals={2}
                                    disabled={noView}
                                    realtime
                                    onDragStart={begin}
                                    onChange={(v) => xform.setCenter('y', v)}
                                    onRelease={end}
                                    onDragCancel={end}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="TraZ">
                                <DragNumericField
                                    value={st?.centerZ ?? 0}
                                    unit="A"
                                    step={0.1}
                                    decimals={2}
                                    disabled={noView}
                                    realtime
                                    onDragStart={begin}
                                    onChange={(v) => xform.setCenter('z', v)}
                                    onRelease={end}
                                    onDragCancel={end}
                                />
                            </FieldGridRow>
                        </FieldGrid>
                    </FieldSection>

                    <FieldSection title="Zoom / Slab">
                        <FieldGrid>
                            <FieldGridRow label="Zoom">
                                <DragNumericField
                                    value={st?.zoom ?? 0}
                                    unit="A"
                                    step={1}
                                    min={0.01}
                                    disabled={noView}
                                    realtime
                                    onDragStart={begin}
                                    onChange={xform.setZoom}
                                    onRelease={end}
                                    onDragCancel={end}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="Slab">
                                <DragNumericField
                                    value={st?.slab ?? 0}
                                    unit="A"
                                    step={1}
                                    min={0}
                                    disabled={noView}
                                    realtime
                                    onDragStart={begin}
                                    onChange={xform.setSlab}
                                    onRelease={end}
                                    onDragCancel={end}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="Dist">
                                <DragNumericField
                                    value={st?.distance ?? 0}
                                    unit="A"
                                    step={1}
                                    min={0}
                                    disabled={noView}
                                    realtime
                                    onDragStart={begin}
                                    onChange={xform.setDistance}
                                    onRelease={end}
                                    onDragCancel={end}
                                />
                            </FieldGridRow>
                        </FieldGrid>
                    </FieldSection>

                    <FieldSection title="Projection">
                        <FieldGrid>
                            <FieldGridRow label="Perspective">
                                <SwitchField
                                    checked={viewProjection === true}
                                    disabled={viewProjection === null}
                                    onChange={onSetPerspective}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="Center mark">
                                <SelectField
                                    value={viewCenterMark ?? 'none'}
                                    disabled={viewCenterMark === null}
                                    onChange={(v) => onSetCenterMark(v as ViewCenterMark)}
                                    aria-label="Center mark"
                                >
                                    <option value="none">None</option>
                                    <option value="crosshair">Crosshair</option>
                                    <option value="axis">Axis</option>
                                </SelectField>
                            </FieldGridRow>
                        </FieldGrid>
                    </FieldSection>
                </div>
            )}
        </div>
    )
}
