/**
 * @file components/dialogs/StyleEditorDialog.tsx
 * @description Style-set editor (UXP `style/style_editor.xul`). Three tabs for
 * a selected style set: Color (named colours), Selection (named MolSel defs),
 * and Styles (style entries). Edits are live-applied through
 * `styleSetEdit.service` (one undo step each, like the ColorPane decks) and the
 * contents are refetched after each change; the dialog just has a Close button
 * (per-edit undo replaces the UXP OK/Cancel). Read-only sets are view-only.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogBody, DialogFooter, Button, Tabs, Tab, InputGroup } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { ColorPickerProvider } from '@renderer/h3-kit/colorpicker'
import { ColorField } from '../../h3-kit/form'
import { AppIcon } from '@renderer/h3-kit/primitives'
import type { GetStyleSetContentsResult } from '../../worker/server/services/styleSetEdit.service'

/** Controlled selection-value input committing on blur / Enter. */
const SelValueField: React.FC<{
    value: string
    disabled?: boolean
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
        <InputGroup
            value={draft}
            disabled={disabled}
            fill
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
        />
    )
}

interface Props {
    visible: boolean
    styleSetId: number
    scopeId: number
    sceneId: number
    styleName: string
    onClose: () => void
}

const ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }
const LIST: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 3,
    maxHeight: 260,
    overflowY: 'auto',
    padding: 4,
    background: 'var(--bg-surface)',
}

export function StyleEditorDialog({
    visible,
    styleSetId,
    scopeId,
    sceneId,
    styleName,
    onClose,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const { cm } = useCueMol()

    const [contents, setContents] = useState<GetStyleSetContentsResult | null>(null)
    const [tab, setTab] = useState<string>('color')
    const [newColor, setNewColor] = useState('')
    const [newSel, setNewSel] = useState('')

    const refetch = useCallback(() => {
        if (!cm) return
        cm.invokeService('getStyleSetContents', { styleSetId })
            .then((r) => setContents(r?.ok ? r : null))
            .catch(() => setContents(null))
    }, [cm, styleSetId])

    useEffect(() => {
        if (visible) refetch()
    }, [visible, refetch])

    const ro = contents?.readonly ?? false

    const call = useCallback(
        (name: string, args: Record<string, unknown>) => {
            if (!cm) return
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(cm.invokeService as any)(name, args).then(refetch).catch(() => undefined)
        },
        [cm, refetch],
    )

    // Color tab
    const onSetColor = (name: string, colorStr: string) =>
        call('setStyleSetColor', { sceneId, styleSetId, scopeId, name, colorStr })
    const onAddColor = () => {
        const n = newColor.trim()
        if (!n) return
        setNewColor('')
        onSetColor(n, '#ffffff')
    }
    // Selection tab
    const onSetSel = (name: string, value: string) =>
        call('setStyleSetSelection', { sceneId, styleSetId, name, value })
    const onAddSel = () => {
        const n = newSel.trim()
        if (!n) return
        setNewSel('')
        onSetSel(n, '*')
    }

    const delBtn = (label: string, onClick: () => void) => (
        <Button
            minimal
            small
            aria-label={label}
            disabled={ro}
            icon={<AppIcon name="ui.remove" size="md" aria-hidden />}
            onClick={onClick}
        />
    )

    const colorPanel = (
        <div>
            <div style={LIST} role="list" aria-label="Named colors">
                {(contents?.colors ?? []).map((c) => (
                    <div key={c.name} style={ROW} role="listitem">
                        <span style={{ width: 120 }}>{c.name}</span>
                        <span style={{ flex: 1 }}>
                            <ColorField
                                value={c.hex}
                                disabled={ro}
                                onCommit={(v) => onSetColor(c.name, v)}
                            />
                        </span>
                        {delBtn(`Delete color ${c.name}`, () =>
                            call('removeStyleSetColor', { sceneId, styleSetId, name: c.name }),
                        )}
                    </div>
                ))}
                {(contents?.colors.length ?? 0) === 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: 4 }}>
                        (no named colors)
                    </div>
                )}
            </div>
            <div style={{ ...ROW, marginTop: 6 }}>
                <InputGroup
                    placeholder="New color name"
                    value={newColor}
                    disabled={ro}
                    onChange={(e) => setNewColor(e.target.value)}
                    fill
                />
                <Button disabled={ro || newColor.trim() === ''} onClick={onAddColor}>
                    Add
                </Button>
            </div>
        </div>
    )

    const selPanel = (
        <div>
            <div style={LIST} role="list" aria-label="Named selections">
                {(contents?.selections ?? []).map((s) => (
                    <div key={s.name} style={ROW} role="listitem">
                        <span style={{ width: 120 }}>{s.name}</span>
                        <span style={{ flex: 1 }}>
                            <SelValueField
                                value={s.value}
                                disabled={ro}
                                onCommit={(v) => onSetSel(s.name, v)}
                            />
                        </span>
                        {delBtn(`Delete selection ${s.name}`, () =>
                            call('removeStyleSetSelection', { sceneId, styleSetId, name: s.name }),
                        )}
                    </div>
                ))}
                {(contents?.selections.length ?? 0) === 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: 4 }}>
                        (no named selections)
                    </div>
                )}
            </div>
            <div style={{ ...ROW, marginTop: 6 }}>
                <InputGroup
                    placeholder="New selection name"
                    value={newSel}
                    disabled={ro}
                    onChange={(e) => setNewSel(e.target.value)}
                    fill
                />
                <Button disabled={ro || newSel.trim() === ''} onClick={onAddSel}>
                    Add
                </Button>
            </div>
        </div>
    )

    const stylePanel = (
        <div style={LIST} role="list" aria-label="Style entries">
            {(contents?.styles ?? []).map((s) => (
                <div key={s.name} style={ROW} role="listitem">
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span style={{ width: 80, color: 'var(--text-secondary)' }}>{s.type}</span>
                    {delBtn(`Delete style ${s.name}`, () =>
                        call('removeStyleSetStyle', { sceneId, styleSetId, name: s.name }),
                    )}
                </div>
            ))}
            {(contents?.styles.length ?? 0) === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: 4 }}>
                    (no style entries)
                </div>
            )}
        </div>
    )

    return (
        <Dialog
            isOpen={visible}
            onClose={onClose}
            title={`Style editor: ${styleName}`}
            style={{ width: 500 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <ColorPickerProvider cm={cm} sceneId={sceneId}>
                <DialogBody>
                    {ro && (
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                            (read-only style set)
                        </div>
                    )}
                    <Tabs id="style-editor-tabs" selectedTabId={tab} onChange={(t) => setTab(String(t))}>
                        <Tab id="color" title="Color" panel={colorPanel} />
                        <Tab id="selection" title="Selection" panel={selPanel} />
                        <Tab id="styles" title="Styles" panel={stylePanel} />
                    </Tabs>
                </DialogBody>
                <DialogFooter
                    actions={
                        <Button intent="primary" onClick={onClose}>
                            Close
                        </Button>
                    }
                />
            </ColorPickerProvider>
        </Dialog>
    )
}
