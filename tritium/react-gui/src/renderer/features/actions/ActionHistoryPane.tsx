/**
 * @file features/actions/ActionHistoryPane.tsx
 * @description The active scene's undo history, one row per undo step, with
 * the ops each step ran (the action log).
 *
 * Drawn as a tree (`ListboxTree`, the scene tree's look): a step that ran
 * more than one op expands to them, one child row per op; a step of one op is
 * that op already, so it has nothing to expand. Rows are selected as any list
 * is (click, Shift for a range, Cmd/Ctrl to add), and the steps of the
 * selection -- a selected op row counts as its step -- are what Save as qax
 * and Copy as commands take.
 *
 * The inspector: double-click a step to show it; click an op row to show
 * that op. Neither moves the undo stack. Moving the scene to a step is an
 * explicit button or menu item (Go to step), so a stray click never undoes
 * anything. The pseudo row at the top is the initial state, where every step
 * is undone.
 *
 * Steps are addressed by the action log's step id, which stays put while
 * steps after it are dropped (a new edit after an undo) -- a row number
 * would not.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup } from '@blueprintjs/core'
import type { TreeNodeInfo } from '@blueprintjs/core'
import { AppIcon, Tooltip } from '@renderer/h3-kit/primitives'
import { ListboxTree, scrollRowIntoView, useListKeyNav } from '@renderer/h3-kit/list'
import { PaneSectionHeader } from '@renderer/shell/PaneSectionHeader'
import { useShowContextMenu } from '@renderer/shell/menu/ContextMenuProvider'
import type { MenuNode } from '@shared/menuNodes'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useClipboardScope } from '@renderer/hooks/useClipboardScope'
import { useActiveScene } from '@renderer/state/workspace'
import { useUndoRedoLocked } from '@renderer/contexts/UndoRedoLockContext'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import type { ActionStepView } from '@renderer/worker/shared/actionTypes'
import { useActionSteps } from './useActionSteps'

export interface ActionHistoryPaneProps {
    collapsed?: boolean
    onToggleCollapse?: () => void
}

/** Row id of the initial-state pseudo row. */
const INITIAL_ROW = 'initial'

/** What a row stands for. */
type RowRef =
    | { kind: 'initial' }
    | { kind: 'step'; stepId: number }
    | { kind: 'entry'; stepId: number; index: number }

const stepRowId = (stepId: number): string => `s:${stepId}`
const entryRowId = (stepId: number, index: number): string => `e:${stepId}:${index}`

function parseRow(id: string): RowRef {
    if (id === INITIAL_ROW) return { kind: 'initial' }
    const [tag, step, index] = id.split(':')
    return tag === 'e'
        ? { kind: 'entry', stepId: Number(step), index: Number(index) }
        : { kind: 'step', stepId: Number(step) }
}

/** The step a row belongs to; null for the initial state. */
function stepOf(id: string): number | null {
    const r = parseRow(id)
    return r.kind === 'initial' ? null : r.stepId
}

type RowMenuAction = 'show' | 'goto' | 'copy' | 'save'

/** The rows from `anchor` to `id` in display order (either way round). */
function rangeOf(items: readonly string[], anchor: string | null, id: string): string[] {
    const a = anchor === null ? -1 : items.indexOf(anchor)
    const b = items.indexOf(id)
    if (a < 0 || b < 0) return [id]
    return items.slice(Math.min(a, b), Math.max(a, b) + 1)
}

export const ActionHistoryPane: React.FC<ActionHistoryPaneProps> = ({ collapsed, onToggleCollapse }) => {
    const { cm } = useCueMol()
    const { activeSceneId } = useActiveScene()
    const { dispatch } = useCommands()
    const locked = useUndoRedoLocked()
    const showContextMenu = useShowContextMenu()
    const { steps } = useActionSteps(cm, activeSceneId)

    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
    const [anchor, setAnchor] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
    const bodyRef = useRef<HTMLDivElement | null>(null)

    /** Row ids in display order, the op rows of expanded steps included. */
    const rowIds = useMemo(() => {
        if (steps.length === 0) return []
        const ids = [INITIAL_ROW]
        for (const s of steps) {
            const id = stepRowId(s.id)
            ids.push(id)
            if (s.entries.length > 1 && expanded.has(id)) {
                s.entries.forEach((_e, i) => ids.push(entryRowId(s.id, i)))
            }
        }
        return ids
    }, [steps, expanded])

    // Rows can go away under the selection (dropped redo side, a collapse).
    const live = useMemo(() => new Set(rowIds), [rowIds])
    const sel = useMemo(() => new Set([...selected].filter((id) => live.has(id))), [selected, live])
    const active = anchor !== null && live.has(anchor) ? anchor : null

    /** The steps of the selection, oldest first; an op row counts as its step. */
    const selectedStepIds = useMemo(() => {
        const ids = new Set<number>()
        for (const id of sel) {
            const s = stepOf(id)
            if (s !== null) ids.add(s)
        }
        return steps.filter((s) => ids.has(s.id)).map((s) => s.id)
    }, [steps, sel])

    /** The last step done: the state the scene is in now. */
    const currentId = useMemo(() => {
        const done = steps.filter((s) => !s.undone)
        return done.length > 0 ? stepRowId(done[done.length - 1].id) : INITIAL_ROW
    }, [steps])

    const run = useCallback((what: string, p: Promise<unknown>): void => {
        p.catch((err: unknown) => console.warn(`${what} failed:`, err))
    }, [])

    const selectOne = useCallback((id: string) => {
        setSelected(new Set([id]))
        setAnchor(id)
    }, [])

    const selectRange = useCallback(
        (id: string, items: readonly string[], additive: boolean) => {
            const range = rangeOf(items, active, id)
            setSelected((prev) => new Set(additive ? [...prev, ...range] : range))
        },
        [active],
    )

    const toggleOne = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
        setAnchor(id)
    }, [])

    const setRowExpanded = useCallback((id: string, open: boolean) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (open) next.add(id)
            else next.delete(id)
            return next
        })
    }, [])

    /** Show a step, or one op of it, in the inspector. */
    const showRow = useCallback(
        (id: string) => {
            const r = parseRow(id)
            if (r.kind === 'initial') return
            run(
                'show step',
                dispatch(CmdId.ActionsShowStep, r.kind === 'entry' ? { stepId: r.stepId, entryIndex: r.index } : { stepId: r.stepId }),
            )
        },
        [dispatch, run],
    )

    const goTo = useCallback(
        (id: string) => {
            run('go to step', dispatch(CmdId.ActionsGoToStep, { stepId: stepOf(id) }))
        },
        [dispatch, run],
    )

    const copySteps = useCallback(
        (ids: number[]) => run('copy actions', dispatch(CmdId.ActionsCopy, { stepIds: ids })),
        [dispatch, run],
    )
    const saveSteps = useCallback(
        (ids: number[]) => run('save actions', dispatch(CmdId.ActionsSave, { stepIds: ids })),
        [dispatch, run],
    )

    const navKeyDown = useListKeyNav({
        items: rowIds,
        activeId: active,
        onSelect: selectOne,
        onSelectRange: selectRange,
        onExpand: (id) => setRowExpanded(id, true),
        onCollapse: (id) => {
            // On an op row, Left goes back to its step, as in the scene tree.
            const r = parseRow(id)
            if (r.kind === 'entry') selectOne(stepRowId(r.stepId))
            else setRowExpanded(id, false)
        },
        onScrollTo: (id) => scrollRowIntoView(bodyRef.current, `[data-row-id="${CSS.escape(id)}"]`),
    })

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (navKeyDown(e)) return
            if (e.key === 'Enter' && active !== null) {
                e.preventDefault()
                showRow(active)
            }
        },
        [navKeyDown, active, showRow],
    )

    // Edit > Copy while the pane is where the user is working.
    useClipboardScope('action-history', {
        copy: () => {
            if (selectedStepIds.length > 0) copySteps(selectedStepIds)
        },
        cut: () => undefined,
        paste: () => undefined,
    })

    const openRowMenu = useCallback(
        (id: string, x: number, y: number, stepIds: number[]) => {
            const step = stepOf(id)
            const stepRow = step === null ? INITIAL_ROW : stepRowId(step)
            const nodes: MenuNode<RowMenuAction>[] = [
                { label: 'Show in Inspector', enabled: step !== null, action: 'show' },
                {
                    label: step !== null ? 'Go to This Step' : 'Go to Initial State',
                    enabled: !locked && stepRow !== currentId,
                    action: 'goto',
                },
                { type: 'separator' },
                { label: 'Copy as Commands', enabled: stepIds.length > 0, action: 'copy' },
                { label: 'Save as qax...', enabled: stepIds.length > 0, action: 'save' },
            ]
            void showContextMenu(nodes, { x, y }).then((action) => {
                switch (action) {
                    case 'show': showRow(id); break
                    case 'goto': goTo(id); break
                    case 'copy': copySteps(stepIds); break
                    case 'save': saveSteps(stepIds); break
                    default: break
                }
            })
        },
        [locked, currentId, showContextMenu, showRow, goTo, copySteps, saveSteps],
    )

    const handleNodeClick = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            const id = String(node.id)
            if (e.shiftKey) selectRange(id, rowIds, e.metaKey || e.ctrlKey)
            else if (e.metaKey || e.ctrlKey) toggleOne(id)
            else {
                selectOne(id)
                // An op row shows its op right away; a step waits for a
                // double-click (its row already says what it did).
                if (parseRow(id).kind === 'entry') showRow(id)
            }
        },
        [rowIds, selectRange, toggleOne, selectOne, showRow],
    )

    const handleNodeDoubleClick = useCallback((node: TreeNodeInfo) => showRow(String(node.id)), [showRow])

    const handleNodeContextMenu = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            e.preventDefault()
            const id = String(node.id)
            // A right-click inside the selection acts on it; outside, on that row.
            let ids = selectedStepIds
            if (!sel.has(id)) {
                selectOne(id)
                const step = stepOf(id)
                ids = step === null ? [] : [step]
            }
            openRowMenu(id, e.clientX, e.clientY, ids)
        },
        [selectedStepIds, sel, selectOne, openRowMenu],
    )

    const handleNodeExpand = useCallback((node: TreeNodeInfo) => setRowExpanded(String(node.id), true), [setRowExpanded])
    const handleNodeCollapse = useCallback((node: TreeNodeInfo) => setRowExpanded(String(node.id), false), [setRowExpanded])

    const treeContents = useMemo<TreeNodeInfo[]>(() => {
        if (steps.length === 0) return []
        // The row is usually too narrow for its text; the tooltip shows it whole.
        const rowLabel = (id: string, text: string, className: string): React.JSX.Element => (
            <Tooltip content={text} placement="right" className="action-row-tip">
                <span className={`action-row-text type-row ${className}`} data-row-id={id}>{text}</span>
            </Tooltip>
        )
        const initial: TreeNodeInfo = {
            id: INITIAL_ROW,
            label: rowLabel(INITIAL_ROW, 'Initial state', 'action-initial-text'),
            isSelected: sel.has(INITIAL_ROW),
            className: currentId === INITIAL_ROW ? 'is-current' : undefined,
        }
        const stepNode = (step: ActionStepView): TreeNodeInfo => {
            const id = stepRowId(step.id)
            const expandable = step.entries.length > 1
            const classes = [step.undone ? 'is-undone' : '', id === currentId ? 'is-current' : '']
                .filter(Boolean)
                .join(' ')
            return {
                id,
                label: rowLabel(id, step.text, ''),
                secondaryLabel: step.source ? <span className="action-row-source type-caption">{step.source}</span> : undefined,
                isSelected: sel.has(id),
                isExpanded: expandable && expanded.has(id),
                hasCaret: expandable,
                className: classes || undefined,
                childNodes: expandable
                    ? step.entries.map((entry, i): TreeNodeInfo => {
                          const eid = entryRowId(step.id, i)
                          return {
                              id: eid,
                              label: rowLabel(eid, entry.text, 'action-entry-text'),
                              isSelected: sel.has(eid),
                              className: step.undone ? 'is-undone' : undefined,
                          }
                      })
                    : undefined,
            }
        }
        return [initial, ...steps.map(stepNode)]
    }, [steps, sel, expanded, currentId])

    const canGoTo = !locked && active !== null && (stepOf(active) === null ? INITIAL_ROW : stepRowId(stepOf(active) as number)) !== currentId

    return (
        <div className="sp-pane action-history-pane">
            <PaneSectionHeader
                title="History"
                icon="activity.actions"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                actions={
                    <ButtonGroup minimal>
                        <Tooltip content="Go to the selected step" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.gotoStep" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canGoTo}
                                onClick={() => active !== null && goTo(active)}
                            />
                        </Tooltip>
                        <Tooltip content="Copy as commands" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.duplicate" aria-hidden />}
                                className="section-action-btn"
                                disabled={selectedStepIds.length === 0}
                                onClick={() => copySteps(selectedStepIds)}
                            />
                        </Tooltip>
                        <Tooltip content="Save as qax" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.saveAs" aria-hidden />}
                                className="section-action-btn"
                                disabled={selectedStepIds.length === 0}
                                onClick={() => saveSteps(selectedStepIds)}
                            />
                        </Tooltip>
                    </ButtonGroup>
                }
            />
            {!collapsed && (
                // tabIndex=-1 keeps the wrapper focusable for the list keys
                // without putting it in the Tab order.
                <div
                    ref={bodyRef}
                    className="sp-pane-scroll action-history-body"
                    tabIndex={-1}
                    data-clipboard-scope="action-history"
                    onKeyDown={handleKeyDown}
                    style={{ outline: 'none' }}
                >
                    {steps.length === 0 ? (
                        <div className="h3-list-empty">(no undo history)</div>
                    ) : (
                        <ListboxTree
                            contents={treeContents}
                            onNodeClick={handleNodeClick}
                            onNodeDoubleClick={handleNodeDoubleClick}
                            onNodeExpand={handleNodeExpand}
                            onNodeCollapse={handleNodeCollapse}
                            onNodeContextMenu={handleNodeContextMenu}
                            className="action-history-tree"
                        />
                    )}
                </div>
            )}
        </div>
    )
}
