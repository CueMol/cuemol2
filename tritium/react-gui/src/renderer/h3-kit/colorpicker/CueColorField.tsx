/**
 * @file h3-kit/colorpicker/CueColorField.tsx
 * @description Reusable colour field: the `ColorPicker` widget wired to a
 * parent that owns a single canonical colour string and commits on change.
 *
 * It pulls `cm` / `sceneId` from the ambient `ColorPickerProvider` so callers
 * only supply the value and a commit callback. `onCommit` fires once per
 * committed change (popover close, palette/named pick, text-box blur) and only
 * when the value actually changed -- live slider drags (`completed=false`) are
 * swallowed so callers do not push an undo step per frame.
 */

import React, { useCallback } from 'react'
import { ColorPicker, type Mode } from './ColorPicker'
import { useColorPickerCtx } from './ColorPickerContext'

interface CueColorFieldProps {
    /** Canonical CueMol colour string owned by the parent. */
    value: string
    /** Called with the new colour on a committed change. */
    onCommit: (next: string) => void
    /** Restrict the picker's mode segments (see `ColorPicker.modes`). */
    modes?: Mode[]
    disabled?: boolean
    className?: string
    /** Open the popover on mount (see `ColorPicker.autoOpen`). */
    autoOpen?: boolean
    /** Focus the text box on mount. */
    autoFocus?: boolean
    /**
     * The user finished with this colour (popover closed, or Escape). A host
     * that mounted the field for one edit returns to its display state here.
     */
    onDone?: () => void
}

/** ColorPicker bound to a parent-owned value with commit-on-completed. */
export const CueColorField: React.FC<CueColorFieldProps> = ({
    value,
    onCommit,
    modes,
    disabled,
    className,
    autoOpen,
    autoFocus,
    onDone,
}) => {
    const { cm, sceneId } = useColorPickerCtx()

    const handleChange = useCallback(
        (next: string, completed: boolean) => {
            if (completed && next !== value) onCommit(next)
        },
        [value, onCommit],
    )

    return (
        <ColorPicker
            value={value}
            cm={cm}
            sceneId={sceneId}
            modes={modes}
            disabled={disabled}
            className={className}
            autoOpen={autoOpen}
            autoFocus={autoFocus}
            onClose={onDone}
            onChange={handleChange}
        />
    )
}
