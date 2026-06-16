import React, { useEffect, useRef, useState } from 'react'
import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    FormGroup,
    InputGroup,
} from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * Single-line text input dialog -- replacement for Electron's disabled
 * `window.prompt`. Used by ScenePane context-menu Rename / New Group
 * flows; intentionally generic so other "ask for a name" callsites
 * can reuse it.
 *
 * Resolves to the trimmed entered string on OK (Enter or button), or
 * `null` on Cancel / outside-close. Empty / whitespace-only input
 * disables OK to mirror UXP `util.prompt`.
 */
interface Props {
    visible: boolean
    title: string
    label: string
    defaultValue: string
    confirmLabel?: string
    onResult: (value: string | null) => void
}

export function TextPromptDialog({
    visible,
    title,
    label,
    defaultValue,
    confirmLabel,
    onResult,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [value, setValue] = useState(defaultValue)

    // Reset / focus / select on each open.
    useEffect(() => {
        if (!visible) return
        setValue(defaultValue)
        // Defer to next tick so Blueprint's portal has mounted the input.
        const id = window.setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 0)
        return () => window.clearTimeout(id)
    }, [visible, defaultValue])

    const trimmed = value.trim()
    const canSubmit = trimmed.length > 0

    const handleOk = (): void => {
        if (!canSubmit) return
        onResult(trimmed)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter' && canSubmit) {
            e.preventDefault()
            handleOk()
        }
    }

    return (
        <Dialog
            isOpen={visible}
            onClose={() => onResult(null)}
            title={title}
            style={{ width: 360 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <FormGroup label={label} labelFor="text-prompt-input">
                    <InputGroup
                        id="text-prompt-input"
                        inputRef={(el) => {
                            inputRef.current = el
                        }}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        fill
                        autoComplete="off"
                    />
                </FormGroup>
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={() => onResult(null)}>Cancel</Button>
                        <Button intent="primary" onClick={handleOk} disabled={!canSubmit}>
                            {confirmLabel ?? 'OK'}
                        </Button>
                    </>
                }
            />
        </Dialog>
    )
}
