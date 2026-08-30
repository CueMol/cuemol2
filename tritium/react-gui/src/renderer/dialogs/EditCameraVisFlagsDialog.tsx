/**
 * @file components/dialogs/EditCameraVisFlagsDialog.tsx
 * @description Editor for a camera's captured visibility-flag set (UXP
 * `tools/visflagset-edit-dlg`). One row per scene element: an Inc checkbox
 * (whether the camera captures it) + the Object / Renderer name + a Vis
 * checkbox (the captured visibility, disabled unless included). OK returns the
 * edited rows; the caller writes them back via `setCameraVisFlags`.
 */

import React, { useEffect, useState } from 'react'
import { Checkbox } from '@blueprintjs/core'
import { DialogShell } from './DialogShell';
import type { VisFlagEntry } from '@renderer/worker/server/services/cameraVisFlags.service'

export interface EditCameraVisFlagsDialogResult {
    entries: VisFlagEntry[]
}

interface Props {
    visible: boolean
    cameraName: string
    entries: VisFlagEntry[]
    onConfirm: (result: EditCameraVisFlagsDialogResult) => void
    onCancel: () => void
}

export function EditCameraVisFlagsDialog({
    visible,
    cameraName,
    entries,
    onConfirm,
    onCancel,
}: Props): React.JSX.Element {

    // Editable copy, re-seeded from the latest props on each open.
    const [rows, setRows] = useState<VisFlagEntry[]>(() => entries.map((e) => ({ ...e })))
    useEffect(() => {
        if (visible) setRows(entries.map((e) => ({ ...e })))
    }, [visible, entries])

    const setRow = (i: number, patch: Partial<VisFlagEntry>): void =>
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

    return (
        <DialogShell
            visible={visible}
            title={`Edit visibility flags: ${cameraName}`}
            width="2xl"
            onCancel={onCancel}
            onOk={() => onConfirm({ entries: rows })}
        >
            <div
                role="table"
                aria-label="Visibility flags"
                style={{
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    maxHeight: 320,
                    overflowY: 'auto',
                    background: 'var(--bg-surface)',
                }}
            >
                <div
                    role="row"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        fontWeight: 'var(--fw-semibold)',
                    }}
                >
                    <span style={{ width: 40 }}>Inc</span>
                    <span style={{ flex: 1 }}>Object / Renderer</span>
                    <span style={{ width: 48 }}>Vis</span>
                </div>
                {rows.length === 0 ? (
                    <div style={{ padding: 8, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        (no scene elements)
                    </div>
                ) : (
                    rows.map((r, i) => (
                        <div
                            role="row"
                            key={r.tgtId}
                            style={{ display: 'flex', alignItems: 'center', padding: '2px 8px' }}
                        >
                            <span style={{ width: 40 }}>
                                <Checkbox
                                    checked={r.included}
                                    onChange={(e) =>
                                        setRow(i, { included: (e.target as HTMLInputElement).checked })
                                    }
                                    aria-label={`Include ${r.tgtName}`}
                                    style={{ margin: 0 }}
                                />
                            </span>
                            <span
                                style={{
                                    flex: 1,
                                    color: r.isObj ? 'var(--text-primary)' : 'var(--text-secondary)',
                                }}
                            >
                                {r.tgtName}
                                {r.isObj ? '' : ' (renderer)'}
                            </span>
                            <span style={{ width: 48 }}>
                                <Checkbox
                                    checked={r.visible}
                                    disabled={!r.included}
                                    onChange={(e) =>
                                        setRow(i, { visible: (e.target as HTMLInputElement).checked })
                                    }
                                    aria-label={`Visible ${r.tgtName}`}
                                    style={{ margin: 0 }}
                                />
                            </span>
                        </div>
                    ))
                )}
            </div>
        </DialogShell>
    )
}
