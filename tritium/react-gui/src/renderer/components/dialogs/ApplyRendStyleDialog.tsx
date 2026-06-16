import React, { useEffect, useMemo, useState } from 'react'
import {
    Button,
    ButtonGroup,
    Dialog,
    DialogBody,
    DialogFooter,
    Divider,
    Menu,
    MenuDivider,
    MenuItem,
    Popover,
} from '@blueprintjs/core'
import { AppIcon } from '../AppIcon'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * "Edit Renderer Style" dialog -- UXP `apply_rend_style.xul` /
 * `apply_rend_style.js`. The dialog lets the user edit the renderer's
 * ordered style list:
 *   - Listbox shows the current applied styles, "(low priority)" at the
 *     top and "(high priority)" at the bottom (matches UXP labels).
 *   - Add button opens a popup populated from the worker pre-fetch.
 *     The popup is split into up to three sections by separator:
 *       1. styles matching `<type_name>$/i`
 *       2. edge styles (`^EgLine`)
 *       3. coloring styles (`(Coloring|Paint)$`)
 *     Adding a style inserts it just below the current selection so
 *     repeated Add clicks build a contiguous run, matching UXP `onAddCmd`.
 *   - Delete / Up / Down operate on the selected row.
 *   - OK resolves with the final ordered list; Cancel resolves null.
 */
export interface ApplyRendStyleDialogResult {
    /** Final ordered list of style names (preserved order, no spacers). */
    styleNames: string[]
}

export interface ApplyRendStyleAvailableEntry {
    name: string
    label: string
}

interface Props {
    visible: boolean
    /** Renderer display info shown at the top of the dialog. */
    rendName: string
    rendTypeName: string
    /** Initial style list (will be copied -- caller's array is not mutated). */
    initialStyles: string[]
    /** Add-popup sections. Already filtered to exclude `initialStyles` entries. */
    typeMatch: ApplyRendStyleAvailableEntry[]
    edgeMatch: ApplyRendStyleAvailableEntry[]
    coloringMatch: ApplyRendStyleAvailableEntry[]
    onConfirm: (result: ApplyRendStyleDialogResult) => void
    onCancel: () => void
}

export function ApplyRendStyleDialog({
    visible,
    rendName,
    rendTypeName,
    initialStyles,
    typeMatch,
    edgeMatch,
    coloringMatch,
    onConfirm,
    onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'

    const [styles, setStyles] = useState<string[]>(() => [...initialStyles])
    const [selectedIdx, setSelectedIdx] = useState<number>(
        () => (initialStyles.length > 0 ? 0 : -1),
    )

    // Reset on each open. UXP `populateStyleList` runs once at onLoad; we
    // mirror that by seeding from the latest props whenever `visible`
    // flips on.
    useEffect(() => {
        if (!visible) return
        setStyles([...initialStyles])
        setSelectedIdx(initialStyles.length > 0 ? 0 : -1)
    }, [visible, initialStyles])

    // Names already in the working list -- used to dim Add popup items
    // the user has already inserted during this dialog session.
    const usedNames = useMemo(() => new Set(styles), [styles])

    const handleAdd = (name: string): void => {
        const next = [...styles]
        const ins = selectedIdx + 1
        if (ins >= 0 && ins < next.length) {
            next.splice(ins, 0, name)
            setStyles(next)
            setSelectedIdx(ins)
        } else {
            next.push(name)
            setStyles(next)
            setSelectedIdx(next.length - 1)
        }
    }

    const handleDelete = (): void => {
        if (selectedIdx < 0) return
        const next = styles.slice()
        next.splice(selectedIdx, 1)
        setStyles(next)
        if (next.length === 0) {
            setSelectedIdx(-1)
        } else {
            setSelectedIdx(Math.min(selectedIdx, next.length - 1))
        }
    }

    const handleMove = (delta: -1 | 1): void => {
        if (selectedIdx < 0) return
        const target = selectedIdx + delta
        if (target < 0 || target >= styles.length) return
        const next = styles.slice()
        const [moved] = next.splice(selectedIdx, 1)
        next.splice(target, 0, moved)
        setStyles(next)
        setSelectedIdx(target)
    }

    const canDelete = selectedIdx >= 0
    const canMoveUp = selectedIdx > 0
    const canMoveDown = selectedIdx >= 0 && selectedIdx < styles.length - 1
    const totalAvailable =
        typeMatch.length + edgeMatch.length + coloringMatch.length

    const renderSection = (
        entries: ApplyRendStyleAvailableEntry[],
        leadingDivider: boolean,
    ): React.JSX.Element[] => {
        const out: React.JSX.Element[] = []
        if (entries.length === 0) return out
        if (leadingDivider) out.push(<MenuDivider key={`sep-${out.length}`} />)
        for (const e of entries) {
            const used = usedNames.has(e.name)
            out.push(
                <MenuItem
                    key={e.name}
                    text={e.label}
                    disabled={used}
                    onClick={() => handleAdd(e.name)}
                />,
            )
        }
        return out
    }

    const addMenu = (
        <Menu>
            {renderSection(typeMatch, false)}
            {renderSection(
                edgeMatch,
                typeMatch.length > 0 && edgeMatch.length > 0,
            )}
            {renderSection(
                coloringMatch,
                (typeMatch.length > 0 || edgeMatch.length > 0) &&
                    coloringMatch.length > 0,
            )}
            {totalAvailable === 0 && (
                <MenuItem text="(no styles)" disabled />
            )}
        </Menu>
    )

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Apply Renderer Style"
            style={{ width: 420 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <div style={{ marginBottom: 8 }}>
                    <strong>Renderer: </strong>
                    {rendName} ({rendTypeName})
                </div>

                <div style={{ marginBottom: 4 }}>Styles:</div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        fontSize: 'var(--fs-base)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    (low priority)
                </div>
                <div
                    role="listbox"
                    aria-label="Applied styles"
                    style={{
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        minHeight: 120,
                        maxHeight: 220,
                        overflowY: 'auto',
                        padding: 2,
                        background: 'var(--bg-surface)',
                    }}
                >
                    {styles.length === 0 ? (
                        <div
                            style={{
                                padding: '8px 4px',
                                color: 'var(--text-secondary)',
                                fontStyle: 'italic',
                            }}
                        >
                            (no styles applied)
                        </div>
                    ) : (
                        styles.map((name, idx) => (
                            <div
                                key={`${name}-${idx}`}
                                role="option"
                                aria-selected={idx === selectedIdx}
                                onClick={() => setSelectedIdx(idx)}
                                style={{
                                    padding: '3px 6px',
                                    cursor: 'pointer',
                                    background:
                                        idx === selectedIdx
                                            ? 'var(--accent)'
                                            : 'transparent',
                                    color:
                                        idx === selectedIdx
                                            ? 'white'
                                            : 'var(--text-primary)',
                                    borderRadius: 2,
                                }}
                            >
                                {name}
                            </div>
                        ))
                    )}
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        fontSize: 'var(--fs-base)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    (high priority)
                </div>

                <Divider style={{ margin: '8px 0' }} />

                <ButtonGroup>
                    <Popover content={addMenu} placement="bottom-start">
                        <Button
                            icon={<AppIcon name="ui.add" aria-hidden />}
                            text="Add"
                            disabled={totalAvailable === 0}
                        />
                    </Popover>
                    <Button
                        icon={<AppIcon name="ui.trash" aria-hidden />}
                        text="Delete"
                        disabled={!canDelete}
                        onClick={handleDelete}
                    />
                    <Button
                        icon={<AppIcon name="ui.caretUp" aria-hidden />}
                        text="Up"
                        disabled={!canMoveUp}
                        onClick={() => handleMove(-1)}
                    />
                    <Button
                        icon={<AppIcon name="ui.caretDown" aria-hidden />}
                        text="Down"
                        disabled={!canMoveDown}
                        onClick={() => handleMove(1)}
                    />
                </ButtonGroup>
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onCancel}>Cancel</Button>
                        <Button
                            intent="primary"
                            onClick={() => onConfirm({ styleNames: styles })}
                        >
                            OK
                        </Button>
                    </>
                }
            />
        </Dialog>
    )
}
