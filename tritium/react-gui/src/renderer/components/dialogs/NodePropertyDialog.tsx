import React from 'react'
import { Dialog, DialogBody, DialogFooter, Button } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import type { NodeInfoEntry } from '../../worker/server/services/sceneOps.service'

/**
 * Phase 2 stub for the per-node property dialog (UXP `onPropCmd`).
 *
 * The eventual goal is a per-type editor (object / renderer / camera /
 * style) that can also mutate values, landing in Phase 5. Until then this
 * dialog renders the read-only key/value list returned by the
 * `getNodeInfo` worker service.
 */

interface Props {
    visible: boolean
    title: string
    entries: NodeInfoEntry[]
    onClose: () => void
}

export function NodePropertyDialog({
    visible,
    title,
    entries,
    onClose,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'

    return (
        <Dialog
            isOpen={visible}
            onClose={onClose}
            title={title || 'Properties'}
            style={{ width: 420 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose
        >
            <DialogBody>
                {entries.length === 0 ? (
                    <div style={{ color: 'var(--pt-text-color-muted)' }}>
                        No properties available for this node.
                    </div>
                ) : (
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            fontSize: 12,
                        }}
                    >
                        <tbody>
                            {entries.map((e) => (
                                <tr key={e.key}>
                                    <td
                                        style={{
                                            padding: '4px 12px 4px 0',
                                            color: 'var(--pt-text-color-muted)',
                                            verticalAlign: 'top',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {e.key}
                                    </td>
                                    <td
                                        style={{
                                            padding: '4px 0',
                                            color: 'var(--pt-text-color)',
                                            wordBreak: 'break-all',
                                        }}
                                    >
                                        {e.value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </DialogBody>
            <DialogFooter
                actions={
                    <Button intent="primary" onClick={onClose}>
                        Close
                    </Button>
                }
            />
        </Dialog>
    )
}
