import React, { useEffect, useRef, useState } from 'react'
import { FormGroup, InputGroup } from '@blueprintjs/core'
import { DialogShell } from './DialogShell';

/**
 * "Create Renderer Style" dialog -- UXP `rendstyle_create.xul` /
 * `rendstyle_create.js`. The dialog collects two inputs:
 *   - target style set (listbox of writable sets, pre-selected to the
 *     scene-local set when one exists)
 *   - base style name (the renderer's `type_name` is shown as a postfix
 *     so the user sees the final composed name; the worker concatenates
 *     them server-side, matching UXP `args.style_name = res_name + typeName`).
 *
 * Resolves with `{ setUid, baseName }` on OK, `null` on Cancel.
 */
export interface CreateRendStyleDialogResult {
    setUid: number
    baseName: string
}

export interface StyleSetOption {
    uid: number
    /** Empty becomes "(anonymous)" in the rendered label. */
    name: string
    scopeId: number
}

interface Props {
    visible: boolean
    rendName: string
    rendTypeName: string
    styleSets: StyleSetOption[]
    defaultSelectedUid: number
    onConfirm: (result: CreateRendStyleDialogResult) => void
    onCancel: () => void
}

export function CreateRendStyleDialog({
    visible,
    rendName,
    rendTypeName,
    styleSets,
    defaultSelectedUid,
    onConfirm,
    onCancel,
}: Props): React.JSX.Element {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [selUid, setSelUid] = useState<number>(defaultSelectedUid)
    const [name, setName] = useState<string>('')

    useEffect(() => {
        if (!visible) return
        setSelUid(defaultSelectedUid)
        setName('')
        const id = window.setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 0)
        return () => window.clearTimeout(id)
    }, [visible, defaultSelectedUid])

    const trimmed = name.trim()
    const canSubmit = trimmed.length > 0 && selUid !== -1

    const handleOk = (): void => {
        if (!canSubmit) return
        onConfirm({ setUid: selUid, baseName: trimmed })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter' && canSubmit) {
            e.preventDefault()
            handleOk()
        }
    }

    return (
        <DialogShell
            visible={visible}
            title="Create Renderer Style"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={!canSubmit}
        >
            <div style={{ marginBottom: 8 }}>
                <strong>Original rend: </strong>
                {rendName} ({rendTypeName})
            </div>

            <FormGroup label="Target Style set:" labelFor="create-style-set-list">
                <div
                    id="create-style-set-list"
                    role="listbox"
                    aria-label="Style sets"
                    style={{
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        minHeight: 100,
                        maxHeight: 180,
                        overflowY: 'auto',
                        padding: 2,
                        background: 'var(--bg-surface)',
                    }}
                >
                    {styleSets.length === 0 ? (
                        <div
                            style={{
                                padding: '8px 4px',
                                color: 'var(--text-secondary)',
                                fontStyle: 'italic',
                            }}
                        >
                            (no writable style sets)
                        </div>
                    ) : (
                        styleSets.map((s) => {
                            const label = s.name === '' ? '(anonymous)' : s.name
                            const selected = s.uid === selUid
                            return (
                                <div
                                    key={s.uid}
                                    role="option"
                                    aria-selected={selected}
                                    onClick={() => setSelUid(s.uid)}
                                    style={{
                                        padding: '3px 6px',
                                        cursor: 'pointer',
                                        background: selected
                                            ? 'var(--accent)'
                                            : 'transparent',
                                        color: selected
                                            ? 'white'
                                            : 'var(--text-primary)',
                                        borderRadius: 2,
                                    }}
                                >
                                    {label}
                                </div>
                            )
                        })
                    )}
                </div>
            </FormGroup>

            <FormGroup label="Style name:" labelFor="create-style-name">
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <InputGroup
                        id="create-style-name"
                        inputRef={(el) => {
                            inputRef.current = el
                        }}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        fill
                        autoComplete="off"
                        placeholder="base name"
                    />
                    <span
                        style={{
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {rendTypeName}
                    </span>
                </div>
            </FormGroup>
        </DialogShell>
    )
}
