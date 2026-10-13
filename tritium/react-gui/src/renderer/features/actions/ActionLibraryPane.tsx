/**
 * @file features/actions/ActionLibraryPane.tsx
 * @description The Actions pane of the Actions view: the preset macros
 * shipped with the app and the user's own qax files (User Actions), run on the
 * scene from here.
 *
 * - A macro that takes an object runs on the objects selected in the scene
 *   tree (a selected renderer counts as its object), else on the scene's only
 *   object; the pane says which ("Target"). A macro without parameters acts
 *   on the scene. Any other parameter list is listed, dimmed, with why it
 *   cannot run yet.
 * - A user file's recorded actions run as one entry (one undo step each, as
 *   the console runs a qax file); its macros are rows under it.
 * - Running is the toolbar's / menu's Run, never a double-click: it changes
 *   the scene, and a double-click is too easy to make by accident.
 *
 * The rows come from the worker reading the files; the pane re-reads them
 * when they change from here (`onLibraryChanged`) or on Refresh.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, ButtonGroup } from '@blueprintjs/core'
import type { TreeNodeInfo } from '@blueprintjs/core'
import { IPC } from '@shared/ipcChannels'
import { AppIcon, Tooltip } from '@renderer/h3-kit/primitives'
import { ListboxTree, TruncatedText } from '@renderer/h3-kit/list'
import { PaneSectionHeader } from '@renderer/shell/PaneSectionHeader'
import { useShowContextMenu } from '@renderer/shell/menu/ContextMenuProvider'
import type { MenuNode } from '@shared/menuNodes'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import { useSceneTreeState } from '@renderer/state/sceneTree'
import { useUndoRedoLocked } from '@renderer/contexts/UndoRedoLockContext'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import type { LibraryFile, LibraryMacro } from '@renderer/worker/shared/actionLibraryTypes'
import { libraryTargets, listLibrary, onLibraryChanged } from './libraryOps'

export interface ActionLibraryPaneProps {
    collapsed?: boolean
    onToggleCollapse?: () => void
}

/** What a row runs, or the group it heads. */
type Entry =
    | { kind: 'group'; origin: 'bundled' | 'user' }
    | { kind: 'file'; file: LibraryFile }
    | { kind: 'macro'; file: LibraryFile; macro: LibraryMacro }

type MenuAction = 'run' | 'copy' | 'rename' | 'delete' | 'reveal' | 'open'

const GROUP_IDS = { bundled: 'g:bundled', user: 'g:user' } as const
const fileRowId = (f: LibraryFile): string => `f:${f.path}`
const macroRowId = (f: LibraryFile, m: LibraryMacro): string => `m:${f.path}\n${m.name}`

/** A file holding one macro and nothing else: shown, and managed, as that macro's row. */
const singleMacro = (f: LibraryFile): LibraryMacro | null =>
    !f.error && f.actionCount === 0 && f.macros.length === 1 ? f.macros[0] : null

export const ActionLibraryPane: React.FC<ActionLibraryPaneProps> = ({ collapsed, onToggleCollapse }) => {
    const { cm } = useCueMol()
    const { tree, selectedIds } = useSceneTreeState()
    const { dispatch } = useCommands()
    const locked = useUndoRedoLocked()
    const showContextMenu = useShowContextMenu()
    const guard = useStaleGuard()

    const [files, setFiles] = useState<LibraryFile[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set([GROUP_IDS.bundled, GROUP_IDS.user]))

    const reload = useCallback(() => {
        const token = guard.next()
        listLibrary(cm)
            .then((list) => {
                if (guard.isCurrent(token)) setFiles(list)
            })
            .catch((err: unknown) => console.warn('listActionLibrary failed:', err))
    }, [cm, guard])

    useEffect(() => {
        reload()
        return onLibraryChanged(reload)
    }, [reload])

    const targets = useMemo(() => libraryTargets(tree, selectedIds), [tree, selectedIds])

    /** Every row by id, for the handlers. */
    const entries = useMemo(() => {
        const map = new Map<string, Entry>()
        map.set(GROUP_IDS.bundled, { kind: 'group', origin: 'bundled' })
        map.set(GROUP_IDS.user, { kind: 'group', origin: 'user' })
        for (const f of files) {
            map.set(fileRowId(f), { kind: 'file', file: f })
            for (const m of f.macros) map.set(macroRowId(f, m), { kind: 'macro', file: f, macro: m })
        }
        return map
    }, [files])

    const current = selected !== null ? entries.get(selected) : undefined

    /** Why the entry cannot run now; null when it can. */
    const whyNot = useCallback(
        (e: Entry | undefined): string | null => {
            if (!e || e.kind === 'group') return 'Select a preset or an action.'
            if (locked) return 'The scene is busy.'
            if (e.kind === 'file') {
                if (e.file.error) return e.file.error
                return e.file.actionCount > 0 ? null : 'This file has no recorded actions to run.'
            }
            const shape = e.macro.shape
            if (shape.kind === 'unsupported') return shape.reason
            if (shape.kind === 'target' && targets.length === 0) {
                return `Select the ${shape.targetType} object to run it on in the scene tree.`
            }
            return null
        },
        [locked, targets],
    )

    const runEntry = useCallback(
        (e: Entry | undefined) => {
            if (!e || whyNot(e) !== null) return
            const args =
                e.kind === 'macro'
                    ? {
                          file: e.file.path,
                          macro: e.macro.name,
                          ...(e.macro.shape.kind === 'target' ? { targetIds: targets.map((t) => t.id) } : {}),
                      }
                    : e.kind === 'file'
                      ? { file: e.file.path }
                      : null
            if (args) dispatch(CmdId.LibraryRun, args).catch((err: unknown) => console.warn('run failed:', err))
        },
        [whyNot, targets, dispatch],
    )

    const openMenu = useCallback(
        (id: string, x: number, y: number) => {
            const e = entries.get(id)
            if (!e || e.kind === 'group') return
            const user = e.file.origin === 'user'
            // The file itself: its row, or the one macro it holds.
            const wholeFile = e.kind === 'file' || singleMacro(e.file) !== null
            const nodes: MenuNode<MenuAction>[] = [
                { label: 'Run', enabled: whyNot(e) === null, action: 'run' },
                { type: 'separator' },
                { label: 'Copy to User Actions', enabled: e.kind === 'macro' && !user, action: 'copy' },
                { label: 'Rename...', enabled: user && wholeFile, action: 'rename' },
                { label: 'Move to Trash', enabled: user && wholeFile, action: 'delete' },
                { type: 'separator' },
                { label: 'Open in Editor', enabled: true, action: 'open' },
                { label: 'Reveal in Finder', enabled: true, action: 'reveal' },
            ]
            const file = e.file.path
            void showContextMenu(nodes, { x, y }).then((action) => {
                const warn = (err: unknown): void => console.warn(`${String(action)} failed:`, err)
                switch (action) {
                    case 'run': runEntry(e); break
                    case 'copy':
                        if (e.kind === 'macro') dispatch(CmdId.LibraryCopyMacro, { file, macro: e.macro.name }).catch(warn)
                        break
                    case 'rename': dispatch(CmdId.LibraryRename, { file }).catch(warn); break
                    case 'delete': dispatch(CmdId.LibraryDelete, { file }).catch(warn); break
                    case 'open': window.electronAPI.invoke(IPC.SHELL_OPEN_PATH, { path: file }).catch(warn); break
                    case 'reveal': window.electronAPI.invoke(IPC.SHELL_REVEAL_PATH, { path: file }).catch(warn); break
                    default: break
                }
            })
        },
        [entries, whyNot, showContextMenu, runEntry, dispatch],
    )

    const treeContents = useMemo<TreeNodeInfo[]>(() => {
        const label = (id: string, text: string, tip: string, dim: boolean): React.JSX.Element => (
            <TruncatedText
                text={text}
                hint={tip || undefined}
                className={`action-row-text type-row${dim ? ' action-library-unavailable' : ''}`}
                data-row-id={id}
            />
        )
        const macroNode = (f: LibraryFile, m: LibraryMacro): TreeNodeInfo => {
            const id = macroRowId(f, m)
            const reason = m.shape.kind === 'unsupported' ? m.shape.reason : ''
            return {
                id,
                label: label(id, m.label, reason || m.description, reason !== ''),
                isSelected: selected === id,
            }
        }
        const fileNode = (f: LibraryFile): TreeNodeInfo => {
            const only = singleMacro(f)
            if (only) return macroNode(f, only)
            const id = fileRowId(f)
            const what = f.error ?? (f.actionCount > 0 ? `${f.actionCount} recorded action(s)` : '')
            return {
                id,
                label: label(id, f.name, what, f.error !== undefined),
                isSelected: selected === id,
                hasCaret: f.macros.length > 0,
                isExpanded: expanded.has(id),
                childNodes: f.macros.length > 0 ? f.macros.map((m) => macroNode(f, m)) : undefined,
            }
        }
        const bundled = files.filter((f) => f.origin === 'bundled')
        const user = files.filter((f) => f.origin === 'user')
        // The shipped file is shown by its macros alone: it is one file the
        // user does not manage.
        const presets = bundled.flatMap((f) => (f.error ? [fileNode(f)] : f.macros.map((m) => macroNode(f, m))))
        const group = (id: string, title: string, kids: TreeNodeInfo[], empty: string): TreeNodeInfo => ({
            id,
            label: <span className="type-row action-library-group">{title}</span>,
            isExpanded: expanded.has(id),
            hasCaret: true,
            childNodes: kids.length > 0 ? kids : [{ id: `${id}:empty`, label: <span className="type-caption action-library-empty">{empty}</span>, disabled: true }],
        })
        return [
            group(GROUP_IDS.bundled, 'Presets', presets, '(no presets)'),
            group(GROUP_IDS.user, 'User Actions', user.map(fileNode), '(none yet)'),
        ]
    }, [files, selected, expanded])

    const setOpen = useCallback((id: string, open: boolean) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (open) next.add(id)
            else next.delete(id)
            return next
        })
    }, [])

    const handleNodeClick = useCallback((node: TreeNodeInfo) => {
        const id = String(node.id)
        if (entries.has(id)) setSelected(id)
    }, [entries])
    const handleNodeContextMenu = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            e.preventDefault()
            const id = String(node.id)
            if (!entries.has(id)) return
            setSelected(id)
            openMenu(id, e.clientX, e.clientY)
        },
        [entries, openMenu],
    )

    const blocked = whyNot(current)
    const targetText =
        targets.length === 0 ? '(none selected)' : targets.length === 1 ? targets[0].name : `${targets.length} objects`

    return (
        <div className="sp-pane action-library-pane">
            <PaneSectionHeader
                title="Actions"
                icon="ui.saveToLibrary"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                actions={
                    <ButtonGroup minimal>
                        <Tooltip content={blocked ?? 'Run'} placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.runAction" aria-hidden />}
                                className="section-action-btn"
                                disabled={blocked !== null}
                                onClick={() => runEntry(current)}
                            />
                        </Tooltip>
                        <Tooltip content="Refresh" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.refresh" aria-hidden />}
                                className="section-action-btn"
                                onClick={reload}
                            />
                        </Tooltip>
                    </ButtonGroup>
                }
            />
            {!collapsed && (
                <div className="sp-pane-scroll action-library-body">
                    <Tooltip content={targets.map((t) => t.name).join(', ')} placement="bottom" disabled={targets.length < 2}>
                        <div className="action-library-target type-caption">
                            Target: <span className="action-library-target-name">{targetText}</span>
                        </div>
                    </Tooltip>
                    <ListboxTree
                        contents={treeContents}
                        onNodeClick={handleNodeClick}
                        onNodeExpand={(n) => setOpen(String(n.id), true)}
                        onNodeCollapse={(n) => setOpen(String(n.id), false)}
                        onNodeContextMenu={handleNodeContextMenu}
                        className="action-library-tree"
                    />
                </div>
            )}
        </div>
    )
}
