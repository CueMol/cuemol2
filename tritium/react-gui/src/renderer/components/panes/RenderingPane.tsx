/**
 * @file RenderingPane.tsx
 * @description Scene rendering / display property pane: ambient occlusion
 * (GTAO), post-process anti-aliasing, background colour, and CMYK colour
 * proofing. Replaces the devtools-only `devRenderOpts` console affordance with
 * a curated, docked panel.
 *
 * Values live in `useSceneRenderOpts` (scene-scoped, event-synced). Every
 * control writes through that hook so the C++ Scene stays the single source of
 * truth and changes are live-previewed (each setter calls `setUpdateFlag()`).
 *
 * Undo: discrete controls (switch / segment / select / colour / text) commit
 * one undo step via `setProp`. The AO numeric sliders bracket their drag so the
 * whole drag (or arrow-hold) is one undo step -- a drag uses
 * begin/live/end/cancel, while a keyboard text-edit commit (no drag) falls back
 * to a discrete `setProp`. The `draggingRef` flag distinguishes the two onChange
 * sources, mirroring `ViewPane`'s `TranslationField`.
 *
 * This pane is one of the components within the Explorer view.
 */

import React, { useEffect, useRef, useState } from 'react'
import { SectionHeader } from './SectionHeader'
import {
    FieldSection,
    FieldGrid,
    FieldGridRow,
    DragNumericField,
    SwitchField,
    SelectField,
    SegmentField,
    ColorField,
    TextField,
} from '../../h3-kit/form'
import { ColorPickerProvider } from '../../h3-kit/colorpicker/ColorPickerContext'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import {
    useSceneRenderOpts,
    type SceneRenderOptsPatch,
} from '../../hooks/useSceneRenderOpts'
import type {
    AaMethodName,
    IccIntentName,
    SceneRenderOptsState,
} from '../../worker/server/services/sceneRenderOpts.service'

export interface RenderingPaneProps {
    cm: AsyncCueMol | null
    activeSceneId: number | undefined
    collapsed?: boolean
    onToggleCollapse?: () => void
}

/** Bracketing controls threaded from the hook into each slider. */
interface SliderCtl {
    setProp: (patch: SceneRenderOptsPatch, label?: string) => void
    beginEdit: (label: string) => void
    liveEdit: (patch: SceneRenderOptsPatch) => void
    endEdit: (patch: SceneRenderOptsPatch) => void
    cancelEdit: () => void
}

/**
 * A single numeric scene-property slider. A drag (or arrow hold) is one undo
 * step via begin/live/end; a text-edit commit (no drag) is a discrete `setProp`.
 * `draggingRef` distinguishes the two onChange sources.
 */
const RenderSlider: React.FC<{
    field: keyof SceneRenderOptsState
    label: string
    value: number
    step: number
    min?: number
    max?: number
    decimals?: number
    unit?: string
    disabled: boolean
    ctl: SliderCtl
}> = ({ field, label, value, step, min, max, decimals, unit, disabled, ctl }) => {
    const draggingRef = useRef(false)
    const patch = (v: number): SceneRenderOptsPatch => ({ [field]: v }) as SceneRenderOptsPatch
    return (
        <DragNumericField
            value={value}
            step={step}
            min={min}
            max={max}
            decimals={decimals}
            unit={unit}
            disabled={disabled}
            realtime
            onDragStart={() => {
                draggingRef.current = true
                ctl.beginEdit(label)
            }}
            onChange={(v) => {
                if (draggingRef.current) ctl.liveEdit(patch(v))
                else ctl.setProp(patch(v), label) // text-edit commit -> discrete
            }}
            onRelease={(v) => {
                if (draggingRef.current) {
                    draggingRef.current = false
                    ctl.endEdit(patch(v))
                }
            }}
            onDragCancel={() => {
                draggingRef.current = false
                ctl.cancelEdit()
            }}
        />
    )
}

const AA_METHODS: { label: string; value: AaMethodName }[] = [
    { label: 'None', value: 'none' },
    { label: 'FXAA', value: 'fxaa' },
    { label: 'SMAA', value: 'smaa' },
]

/** Jitter level 0-5 -> sample count label. */
const JITTER_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: 'Off' },
    { value: 1, label: '2x' },
    { value: 2, label: '4x' },
    { value: 3, label: '8x' },
    { value: 4, label: '16x' },
    { value: 5, label: '32x' },
]

const ICC_INTENTS: { value: IccIntentName; label: string }[] = [
    { value: 'perceptual', label: 'Perceptual' },
    { value: 'relative_colorimetric', label: 'Relative colorimetric' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'absolute_colorimetric', label: 'Absolute colorimetric' },
]

/** Default CMYK profile applied when proofing is enabled with none set (UXP parity). */
const DEFAULT_ICC_PROFILE = 'GenericCMYK.icm'

/**
 * Text field for the ICC profile path. Holds a local draft and commits only on
 * blur / Enter so typing does not push an undo step per keystroke.
 */
const IccProfileField: React.FC<{
    value: string
    disabled: boolean
    onCommit: (v: string) => void
}> = ({ value, disabled, onCommit }) => {
    const [draft, setDraft] = useState(value)
    useEffect(() => {
        setDraft(value)
    }, [value])
    const commit = (): void => {
        if (draft !== value) onCommit(draft)
    }
    return (
        <TextField
            value={draft}
            disabled={disabled}
            placeholder="ICC profile"
            onChange={setDraft}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
        />
    )
}

export const RenderingPane: React.FC<RenderingPaneProps> = ({
    cm,
    activeSceneId,
    collapsed = false,
    onToggleCollapse,
}) => {
    const ro = useSceneRenderOpts({ cm, sceneId: activeSceneId })
    const st = ro.state
    const noScene = !st
    const ctl: SliderCtl = ro
    // AO sub-controls (radius..halfRes, jitter) only act when the AO path is on.
    const aoOff = noScene || !st?.aoEnabled

    return (
        <div className="sp-pane rendering-pane">
            <SectionHeader
                title="Rendering"
                icon="ui.settings"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <ColorPickerProvider cm={cm} sceneId={activeSceneId}>
                    <div className="sp-pane-scroll rendering-pane-body">
                        <FieldSection title="Ambient Occlusion">
                            <FieldGrid>
                                <FieldGridRow label="Enabled">
                                    <SwitchField
                                        checked={st?.aoEnabled ?? false}
                                        disabled={noScene}
                                        onChange={(v) => ro.setProp({ aoEnabled: v }, 'Ambient occlusion')}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Radius">
                                    <RenderSlider
                                        field="aoRadius"
                                        label="AO radius"
                                        value={st?.aoRadius ?? 0}
                                        step={0.1}
                                        min={0.1}
                                        decimals={1}
                                        unit="A"
                                        disabled={aoOff}
                                        ctl={ctl}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Intensity">
                                    <RenderSlider
                                        field="aoIntensity"
                                        label="AO intensity"
                                        value={st?.aoIntensity ?? 0}
                                        step={0.1}
                                        min={0}
                                        decimals={1}
                                        disabled={aoOff}
                                        ctl={ctl}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Slices">
                                    <RenderSlider
                                        field="aoSlices"
                                        label="AO slices"
                                        value={st?.aoSlices ?? 0}
                                        step={1}
                                        min={1}
                                        max={32}
                                        decimals={0}
                                        disabled={aoOff}
                                        ctl={ctl}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Steps">
                                    <RenderSlider
                                        field="aoSteps"
                                        label="AO steps"
                                        value={st?.aoSteps ?? 0}
                                        step={1}
                                        min={1}
                                        max={16}
                                        decimals={0}
                                        disabled={aoOff}
                                        ctl={ctl}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Half res">
                                    <SwitchField
                                        checked={st?.aoHalfRes ?? false}
                                        disabled={aoOff}
                                        onChange={(v) => ro.setProp({ aoHalfRes: v }, 'AO half resolution')}
                                    />
                                </FieldGridRow>
                            </FieldGrid>
                        </FieldSection>

                        <FieldSection title="Anti-aliasing">
                            <FieldGrid>
                                <FieldGridRow label="Method">
                                    <SegmentField
                                        value={st?.aaMethod ?? 'none'}
                                        disabled={noScene}
                                        options={AA_METHODS}
                                        onValueChange={(v) => ro.setProp({ aaMethod: v }, 'Anti-aliasing method')}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Jitter SS">
                                    <SelectField
                                        value={String(st?.aaJitterLevel ?? 0)}
                                        disabled={aoOff}
                                        aria-label="Jitter supersampling"
                                        onChange={(v) =>
                                            ro.setProp({ aaJitterLevel: Number(v) }, 'Jitter supersampling')
                                        }
                                    >
                                        {JITTER_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </SelectField>
                                </FieldGridRow>
                            </FieldGrid>
                        </FieldSection>

                        <FieldSection title="Background">
                            <FieldGrid>
                                <FieldGridRow label="Color">
                                    <ColorField
                                        value={st?.bgColor ?? '#000000'}
                                        disabled={noScene}
                                        onCommit={(hex) => ro.setProp({ bgColor: hex }, 'Background color')}
                                    />
                                </FieldGridRow>
                            </FieldGrid>
                        </FieldSection>

                        <FieldSection title="Color proofing">
                            <FieldGrid>
                                <FieldGridRow label="Enabled">
                                    <SwitchField
                                        checked={st?.useColProof ?? false}
                                        disabled={noScene}
                                        onChange={(v) => {
                                            // Enabling with no profile set: seed a default CMYK
                                            // profile so proofing actually takes effect (UXP parity).
                                            const patch: SceneRenderOptsPatch = { useColProof: v }
                                            if (v && !st?.iccFilename) patch.iccFilename = DEFAULT_ICC_PROFILE
                                            ro.setProp(patch, 'Color proofing')
                                        }}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Profile">
                                    <IccProfileField
                                        value={st?.iccFilename ?? ''}
                                        disabled={noScene}
                                        onCommit={(v) => ro.setProp({ iccFilename: v }, 'ICC profile')}
                                    />
                                </FieldGridRow>
                                <FieldGridRow label="Intent">
                                    <SelectField
                                        value={st?.iccIntent ?? 'perceptual'}
                                        disabled={noScene}
                                        aria-label="Rendering intent"
                                        onChange={(v) =>
                                            ro.setProp({ iccIntent: v as IccIntentName }, 'Rendering intent')
                                        }
                                    >
                                        {ICC_INTENTS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </SelectField>
                                </FieldGridRow>
                            </FieldGrid>
                        </FieldSection>
                    </div>
                </ColorPickerProvider>
            )}
        </div>
    )
}
