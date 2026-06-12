/**
 * @file ViewPane.tsx
 * @description View / camera-transform pane (UXP `panel.fakedial` port).
 *
 * Three transform sections -- Rotation, Translation, Zoom/Slab -- plus a
 * Projection section that consolidates the View attributes that already have
 * menu commands (perspective, center mark, background colour).
 *
 * The fake-dial rotary UX is reproduced with `DragNumericField` used WITHOUT
 * bounds (Blender-style unbounded horizontal drag, no fill bar): one field
 * replaces each UXP wheel + textbox pair. Transform values live in
 * `useViewXform`; rotation is relative (each drag delta is applied via
 * `rotateView` and the field accumulator resets on release). The Projection
 * controls are driven by props sourced from `useActiveViewState` and written
 * through the existing view/scene commands, so that hook stays the single
 * source of truth and the native menu stays in sync. See ADR-0025.
 *
 * This pane is one of the components within the Explorer view.
 */

import React, { useRef, useState } from 'react'
import { SectionHeader } from './SectionHeader'
import { Field, FieldSection, DragNumericField, SwitchField, SelectField } from '../../h3-kit/form'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { ViewCenterMark, SceneBgColor } from '../../../shared/ipcTypes'
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
    sceneBgColor: SceneBgColor | null
    onSetPerspective: (perspective: boolean) => void
    onSetCenterMark: (mark: ViewCenterMark) => void
    onSetBgColor: (color: 'white' | 'black') => void
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
    sceneBgColor,
    onSetPerspective,
    onSetCenterMark,
    onSetBgColor,
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
                <div className="sp-pane-fill">
                    <FieldSection title="Rotation">
                        <Field label="RotX">
                            <RotationField axis="x" disabled={noView} onRotate={xform.rotate} onBegin={begin} onEnd={end} />
                        </Field>
                        <Field label="RotY">
                            <RotationField axis="y" disabled={noView} onRotate={xform.rotate} onBegin={begin} onEnd={end} />
                        </Field>
                        <Field label="RotZ">
                            <RotationField axis="z" disabled={noView} onRotate={xform.rotate} onBegin={begin} onEnd={end} />
                        </Field>
                    </FieldSection>

                    <FieldSection title="Translation">
                        <Field label="TraX">
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
                        </Field>
                        <Field label="TraY">
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
                        </Field>
                        <Field label="TraZ">
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
                        </Field>
                    </FieldSection>

                    <FieldSection title="Zoom / Slab">
                        <Field label="Zoom">
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
                        </Field>
                        <Field label="Slab">
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
                        </Field>
                        <Field label="Dist">
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
                        </Field>
                    </FieldSection>

                    <FieldSection title="Projection">
                        <Field label="Perspective" inline>
                            <SwitchField
                                checked={viewProjection === true}
                                disabled={viewProjection === null}
                                onChange={onSetPerspective}
                            />
                        </Field>
                        <Field label="Center mark">
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
                        </Field>
                        <Field label="Background">
                            <SelectField
                                value={sceneBgColor ?? 'white'}
                                disabled={sceneBgColor === null}
                                onChange={(v) => onSetBgColor(v as 'white' | 'black')}
                                aria-label="Background colour"
                            >
                                <option value="white">White</option>
                                <option value="black">Black</option>
                            </SelectField>
                        </Field>
                    </FieldSection>
                </div>
            )}
        </div>
    )
}
