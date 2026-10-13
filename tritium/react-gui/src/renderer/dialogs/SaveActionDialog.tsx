import React, { useEffect, useState } from 'react'
import { DialogShell } from './DialogShell'
import { CheckboxField, Field, FieldSection, TextField, isImeKey } from '@renderer/h3-kit/form'

/**
 * Save the History steps the user selected into User Actions: a name, and
 * whether to save them as a macro -- run on whichever object is selected,
 * instead of the one they were recorded on.
 *
 * The macro choice is on by default when the steps can be one; when they
 * cannot (two objects, or a renderer the steps do not create), it is off and
 * disabled, with the reason under it.
 *
 * Resolves to `{ name, asMacro }` on Save, or null on Cancel.
 */
interface Props {
    visible: boolean
    /** Why the steps cannot be a macro; null when they can. */
    macroBlock: string | null
    onResult: (value: { name: string; asMacro: boolean } | null) => void
}

export function SaveActionDialog({ visible, macroBlock, onResult }: Props): React.JSX.Element {
    const [name, setName] = useState('')
    const [asMacro, setAsMacro] = useState(true)

    useEffect(() => {
        if (!visible) return
        setName('')
        setAsMacro(macroBlock === null)
    }, [visible, macroBlock])

    const trimmed = name.trim()
    const canSubmit = trimmed.length > 0
    const handleOk = (): void => {
        if (canSubmit) onResult({ name: trimmed, asMacro: asMacro && macroBlock === null })
    }

    return (
        <DialogShell
            visible={visible}
            title="Save to Actions"
            width="md"
            onCancel={() => onResult(null)}
            onOk={handleOk}
            okLabel="Save"
            okDisabled={!canSubmit}
        >
            <FieldSection title="Action">
                <Field label="Name">
                    <TextField
                        value={name}
                        onChange={setName}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isImeKey(e.nativeEvent)) {
                                e.preventDefault()
                                handleOk()
                            }
                        }}
                    />
                </Field>
                <Field label="Run on the selected object (save as a macro)" inline controlFirst>
                    <CheckboxField checked={asMacro && macroBlock === null} onChange={setAsMacro} disabled={macroBlock !== null} />
                </Field>
                <div className="type-caption save-action-note">
                    {macroBlock ??
                        (asMacro
                            ? 'It runs on whichever object is selected when you run it.'
                            : 'It runs on the objects it was recorded on, by their names.')}
                </div>
            </FieldSection>
        </DialogShell>
    )
}
