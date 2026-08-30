/**
 * @file dialogs/EditInteractionListDialog.tsx
 * @description Editor for an atom-interaction renderer's definition list (UXP
 * `tools/aintr-edit-dlg`). Lists each distance / angle / torsion entry with a
 * per-row Delete; OK returns the ids removed during the session (the caller
 * deletes them via `removeAtomIntrDefs`). Cancel discards.
 */

import React, { useEffect, useState } from 'react'
import { Button } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';
import { AppIcon } from '@renderer/h3-kit/primitives'
import type { AtomIntrDefEntry } from '@renderer/worker/server/services/rend/atomIntrEdit'

export interface EditInteractionListDialogResult {
    /** Definition ids the user removed; empty means "no change". */
    removeIds: number[]
}

const MODE_LABEL: Record<number, string> = { 1: 'Distance', 2: 'Angle', 3: 'Torsion' }

interface Props {
    visible: boolean
    rendName: string
    entries: AtomIntrDefEntry[]
    onConfirm: (result: EditInteractionListDialogResult) => void
    onCancel: () => void
}

export function EditInteractionListDialog({
    visible,
    rendName,
    entries,
    onConfirm,
    onCancel,
}: Props): React.JSX.Element {

    // Working copy of remaining rows, re-seeded on each open.
    const [rows, setRows] = useState<AtomIntrDefEntry[]>(() => entries.map((e) => ({ ...e })))
    useEffect(() => {
        if (visible) setRows(entries.map((e) => ({ ...e })))
    }, [visible, entries])

    const removeRow = (id: number): void => setRows((prev) => prev.filter((r) => r.id !== id))

    const handleOk = (): void => {
        const remaining = new Set(rows.map((r) => r.id))
        const removeIds = entries.map((e) => e.id).filter((id) => !remaining.has(id))
        onConfirm({ removeIds })
    }

    return (
        <DialogShell
            visible={visible}
            title={`Edit interaction list: ${rendName}`}
            width="4xl"
            onCancel={onCancel}
            onOk={handleOk}
        >
            <div
                role="table"
                aria-label="Interaction definitions"
                style={{
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    maxHeight: 320,
                    overflowY: 'auto',
                    background: 'var(--bg-surface)',
                }}
            >
                {rows.length === 0 ? (
                    <div style={{ padding: 8, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        (no interactions)
                    </div>
                ) : (
                    rows.map((r) => (
                        <div
                            role="row"
                            key={r.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px' }}
                        >
                            <span style={{ width: 64, color: 'var(--text-secondary)' }}>
                                {MODE_LABEL[r.mode] ?? '?'}
                            </span>
                            <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>
                                {r.atoms.join('  -  ')}
                            </span>
                            <Button
                                minimal
                                small
                                aria-label={`Delete interaction ${r.id}`}
                                icon={<AppIcon name="ui.remove" size="md" aria-hidden />}
                                onClick={() => removeRow(r.id)}
                            />
                        </div>
                    ))
                )}
            </div>
        </DialogShell>
    )
}
