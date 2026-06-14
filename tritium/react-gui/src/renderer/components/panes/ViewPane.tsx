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
 * replaces each UXP wheel + textbox pair. Drag sensitivity is pinned to the
 * UXP wheel's 1 unit / pixel via `pxPerStep={1}` (the kit default of 8 is for
 * other panes). Transform values live in `useViewXform`; rotation is relative
 * (each drag delta is applied via `rotateView`, the field accumulator resets on
 * release). Translation is also relative on drag -- a camera-pan via
 * `translateView` whose single-axis input couples all three world-center
 * components -- but its field shows the absolute center and a text-edit commit
 * sets the coordinate absolutely (see `TranslationField`). The Projection
 * controls are driven by props sourced from `useActiveViewState` and written
 * through the existing view commands, so that hook stays the single source of
 * truth and the native menu stays in sync. See ADR-0025.
 *
 * This pane is one of the components within the Explorer view.
 */

import React, { useRef, useState } from 'react'
import { SectionHeader } from './SectionHeader'
import { FieldSection, FieldGrid, FieldGridRow, DragNumericField, SwitchField, SelectField } from '../../h3-kit/form'
import type { DragNumericFieldHandle } from '../../h3-kit/form'
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
            pxPerStep={1}
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

/**
 * A single translation (view-center) axis control. The field shows the
 * ABSOLUTE world-center coordinate, but its interactions are split to match
 * UXP `fakedial`:
 *   - a drag (and arrow press) is a camera-relative pan (`onPan`): each frame's
 *     value delta is the pixel-equivalent pan amount, fed to the worker's
 *     `translateView`. The displayed value is the live center mirrored back
 *     from the worker; it is intentionally decoupled from the field's internal
 *     drag accumulator (the `DragNumericField` captures its start value at
 *     mousedown, so live `value` updates do not corrupt the per-frame delta).
 *   - a text-edit commit sets the ABSOLUTE coordinate (`onSetAbsolute`), like
 *     UXP `onValChgT` (`vec.x = val`), since the user typed a coordinate, not a
 *     pan. The `draggingRef` flag distinguishes the two onChange sources (a drag
 *     / arrow press fires onDragStart first; a text commit does not).
 *
 * `fieldRef` / `onCommitNext` / `onCommitPrev` wire the keyboard field-to-field
 * entry so x -> y -> z can be typed in sequence (Enter / Tab / Shift+Tab).
 */
const TranslationField: React.FC<{
    axis: CenterAxis
    value: number
    disabled: boolean
    onPan: (axis: CenterAxis, delta: number) => void
    onSetAbsolute: (axis: CenterAxis, v: number) => void
    onBegin: () => void
    onEnd: () => void
    fieldRef?: React.Ref<DragNumericFieldHandle>
    onCommitNext?: () => void
    onCommitPrev?: () => void
}> = ({ axis, value, disabled, onPan, onSetAbsolute, onBegin, onEnd, fieldRef, onCommitNext, onCommitPrev }) => {
    const prevRef = useRef(value)
    const draggingRef = useRef(false)
    return (
        <DragNumericField
            ref={fieldRef}
            value={value}
            unit="A"
            step={1}
            pxPerStep={1}
            fineSnap={0.01}
            decimals={2}
            disabled={disabled}
            realtime
            onDragStart={() => {
                draggingRef.current = true
                prevRef.current = value
                onBegin()
            }}
            onChange={(v) => {
                if (!draggingRef.current) {
                    // Text-edit commit -> absolute coordinate (UXP onValChgT).
                    onSetAbsolute(axis, v)
                    return
                }
                const delta = v - prevRef.current
                prevRef.current = v
                if (delta !== 0) onPan(axis, delta)
            }}
            onRelease={() => {
                draggingRef.current = false
                onEnd()
            }}
            onDragCancel={() => {
                draggingRef.current = false
                onEnd()
            }}
            onCommitNext={onCommitNext}
            onCommitPrev={onCommitPrev}
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

    // Refs to the TraX / TraY / TraZ fields so a text-edit commit can drop the
    // next axis straight into edit mode (x -> y -> z chained entry).
    const traXRef = useRef<DragNumericFieldHandle>(null)
    const traYRef = useRef<DragNumericFieldHandle>(null)
    const traZRef = useRef<DragNumericFieldHandle>(null)

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
                                <TranslationField
                                    axis="x"
                                    value={st?.centerX ?? 0}
                                    disabled={noView}
                                    onPan={(axis, delta) => xform.translate(axis, delta, true)}
                                    onSetAbsolute={xform.setCenter}
                                    onBegin={begin}
                                    onEnd={end}
                                    fieldRef={traXRef}
                                    onCommitNext={() => traYRef.current?.focusEdit()}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="TraY">
                                <TranslationField
                                    axis="y"
                                    value={st?.centerY ?? 0}
                                    disabled={noView}
                                    onPan={(axis, delta) => xform.translate(axis, delta, true)}
                                    onSetAbsolute={xform.setCenter}
                                    onBegin={begin}
                                    onEnd={end}
                                    fieldRef={traYRef}
                                    onCommitNext={() => traZRef.current?.focusEdit()}
                                    onCommitPrev={() => traXRef.current?.focusEdit()}
                                />
                            </FieldGridRow>
                            <FieldGridRow label="TraZ">
                                <TranslationField
                                    axis="z"
                                    value={st?.centerZ ?? 0}
                                    disabled={noView}
                                    onPan={(axis, delta) => xform.translate(axis, delta, true)}
                                    onSetAbsolute={xform.setCenter}
                                    onBegin={begin}
                                    onEnd={end}
                                    fieldRef={traZRef}
                                    onCommitPrev={() => traYRef.current?.focusEdit()}
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
                                    pxPerStep={1}
                                    decimals={0}
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
                                    pxPerStep={1}
                                    decimals={0}
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
                                    pxPerStep={1}
                                    decimals={0}
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
