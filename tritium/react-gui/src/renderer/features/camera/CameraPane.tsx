/**
 * @file features/camera/CameraPane.tsx
 * @description The scene's saved cameras, as a list with its own toolbar.
 *
 * UXP kept the cameras as a branch of the workspace tree, where every
 * operation lived behind a right-click. They are a list of viewpoints, not
 * part of the object hierarchy, so here they get their own pane: the four
 * operations a user reaches for -- save this view into the selected camera,
 * apply that camera to the view, each with or without the stored show/hide
 * state -- are toolbar buttons, and the rest stays on the context menu.
 *
 * Rows are addressed by name (a registered camera has no uid -- ADR-0005) and
 * can be dragged to reorder; the order is stored on the cameras themselves and
 * saved with the scene. `__current` -- the viewpoint the scene was saved with --
 * is listed as UXP listed it, but pinned to the top and left out of the
 * ordering: it is where the scene opens, not one of the viewpoints the user
 * arranges. Double-click applies with show/hide, as in UXP.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup } from '@blueprintjs/core'
import { AppIcon, Tooltip } from '@renderer/h3-kit/primitives'
import { Listbox, ListRow, scrollRowIntoView, useListKeyNav } from '@renderer/h3-kit/list'
import { PaneSectionHeader } from '@renderer/shell/PaneSectionHeader'
import { InlineRenameInput } from '@renderer/features/scene/InlineRenameInput'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useActiveScene } from '@renderer/state/workspace'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { useClipboardScope } from '@renderer/hooks/useClipboardScope'
import { CmdId } from '@renderer/commands/ids'
import { CURRENT_CAMERA_NAME } from '@renderer/worker/shared/cameraTypes'
import { useCameraList } from './useCameraList'
import { useCameraCtxMenu } from './useCameraCtxMenu'
import { useCameraDragDrop } from './useCameraDragDrop'

export interface CameraPaneProps {
    collapsed?: boolean
    onToggleCollapse?: () => void
}

export const CameraPane: React.FC<CameraPaneProps> = ({ collapsed, onToggleCollapse }) => {
    const { cm } = useCueMol()
    const { activeSceneId, activeMolViewId } = useActiveScene()
    const { dispatch } = useCommands()
    const { cameras } = useCameraList(cm, activeSceneId)

    const [selected, setSelected] = useState<string | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const bodyRef = useRef<HTMLDivElement | null>(null)
    const renameRef = useRef<HTMLInputElement | null>(null)

    const names = useMemo(() => cameras.map((c) => c.name), [cameras])
    // A camera can go away under the selection (deleted, scene reloaded).
    const active = selected !== null && names.includes(selected) ? selected : null
    const hasView = activeMolViewId !== undefined

    /** Run a command, keeping a rejection out of the render path. */
    const run = useCallback(
        (what: string, p: Promise<unknown>): void => {
            p.catch((err: unknown) => console.warn(`${what} failed:`, err))
        },
        [],
    )

    const beginRename = useCallback((name: string) => setEditing(name), [])
    const openMenu = useCameraCtxMenu({ onRename: beginRename })

    const dnd = useCameraDragDrop({
        names,
        pinned: CURRENT_CAMERA_NAME,
        enabled: editing === null,
        onReorder: (next) => run('reorder cameras', dispatch(CmdId.CameraReorder, { names: next })),
    })

    // Put the caret in the rename editor as soon as it appears.
    useEffect(() => {
        if (editing === null) return
        const el = renameRef.current
        if (!el) return
        el.focus()
        el.select()
    }, [editing])

    const focusBody = useCallback(() => bodyRef.current?.focus(), [])

    const commitRename = useCallback(
        (value: string) => {
            const oldName = editing
            setEditing(null)
            focusBody()
            const newName = value.trim()
            if (!oldName || newName.length === 0 || newName === oldName) return
            run(
                'rename camera',
                dispatch(CmdId.CameraRename, { oldName, newName }).then((ok) => {
                    if (ok) setSelected(newName)
                }),
            )
        },
        [editing, dispatch, focusBody, run],
    )

    const applyToView = useCallback(
        (name: string, withVisFlags: boolean) => {
            run('apply camera', dispatch(CmdId.CameraApplyToView, { name, withVisFlags }))
        },
        [dispatch, run],
    )

    const saveFromView = useCallback(
        (name: string, withVisFlags: boolean) => {
            run('save camera', dispatch(CmdId.CameraSaveFromView, { name, withVisFlags }))
        },
        [dispatch, run],
    )

    /** Row classes: the pinned row's own, plus the live drop indicator. */
    const rowClass = useCallback(
        (name: string): string | undefined => {
            const parts: string[] = []
            if (name === CURRENT_CAMERA_NAME) parts.push('is-pinned')
            if (dnd.indicator?.name === name) parts.push(`is-drop-${dnd.indicator.side}`)
            return parts.length > 0 ? parts.join(' ') : undefined
        },
        [dnd.indicator],
    )

    const navKeyDown = useListKeyNav({
        items: names,
        activeId: active,
        onSelect: setSelected,
        onScrollTo: (id) =>
            scrollRowIntoView(bodyRef.current, `[data-camera-name="${CSS.escape(id)}"]`),
        enabled: editing === null,
    })

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (editing !== null) return
            if (navKeyDown(e)) return
            if ((e.key === 'Delete' || e.key === 'Backspace') && active) {
                e.preventDefault()
                run('delete camera', dispatch(CmdId.CameraDelete, { name: active }))
                return
            }
            if (e.key === 'F2' && active) {
                e.preventDefault()
                beginRename(active)
            }
        },
        [editing, navKeyDown, active, dispatch, run, beginRename],
    )

    // Edit > Cut / Copy / Paste while the pane is where the user is working.
    useClipboardScope('camera-list', {
        copy: () => {
            if (active) run('copy camera', dispatch(CmdId.CameraCopy, { name: active }))
        },
        paste: () => run('paste camera', dispatch(CmdId.CameraPaste)),
        cut: () => {
            if (!active) return
            // Delete only once the copy is actually on the clipboard, so a
            // failed write cannot lose the camera (same rule as the tree).
            run(
                'cut camera',
                dispatch(CmdId.CameraCopy, { name: active }).then((ok) =>
                    ok ? dispatch(CmdId.CameraDelete, { name: active }) : undefined,
                ),
            )
        },
    })

    const newCamera = useCallback(() => {
        run(
            'new camera',
            dispatch(CmdId.CameraNew).then((name) => {
                if (name) setSelected(name)
            }),
        )
    }, [dispatch, run])

    const canEdit = hasView && active !== null

    return (
        <div className="sp-pane camera-pane">
            <PaneSectionHeader
                title="Camera"
                icon="ui.camera"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                actions={
                    <ButtonGroup minimal>
                        <Tooltip content="New camera from view" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.add" aria-hidden />}
                                className="section-action-btn"
                                disabled={!hasView}
                                onClick={newCamera}
                            />
                        </Tooltip>
                        <Tooltip content="Save from view" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.cameraSave" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canEdit}
                                onClick={() => active && saveFromView(active, false)}
                            />
                        </Tooltip>
                        <Tooltip content="Save from view with show/hide" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.cameraSaveVis" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canEdit}
                                onClick={() => active && saveFromView(active, true)}
                            />
                        </Tooltip>
                        <Tooltip content="Apply to view" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.cameraApply" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canEdit}
                                onClick={() => active && applyToView(active, false)}
                            />
                        </Tooltip>
                        <Tooltip content="Apply to view with show/hide" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.cameraApplyVis" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canEdit}
                                onClick={() => active && applyToView(active, true)}
                            />
                        </Tooltip>
                        <Tooltip content="Delete" placement="bottom">
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.trash" aria-hidden />}
                                className="section-action-btn"
                                disabled={active === null}
                                onClick={() =>
                                    active &&
                                    run('delete camera', dispatch(CmdId.CameraDelete, { name: active }))
                                }
                            />
                        </Tooltip>
                    </ButtonGroup>
                }
            />
            {!collapsed && (
                // tabIndex=-1 keeps the wrapper focusable for the list keys
                // without putting it in the Tab order; the selected-row
                // background already shows where the user is.
                <div
                    ref={bodyRef}
                    className="sp-pane-scroll camera-pane-body"
                    tabIndex={-1}
                    data-clipboard-scope="camera-list"
                    onKeyDown={handleKeyDown}
                    onDragOver={dnd.onListDragOver}
                    onDrop={dnd.onListDrop}
                    onDragLeave={dnd.onListDragLeave}
                    onContextMenu={(e) => {
                        // Empty space below the rows: the root menu.
                        if (e.target !== e.currentTarget) return
                        e.preventDefault()
                        void openMenu(null, e.clientX, e.clientY)
                    }}
                    style={{ outline: 'none' }}
                >
                    {cameras.length === 0 ? (
                        <div className="h3-list-empty">(no cameras)</div>
                    ) : (
                        <Listbox>
                            {cameras.map((cam) => (
                                <ListRow
                                    key={cam.name}
                                    selected={cam.name === active}
                                    className={rowClass(cam.name)}
                                    data-camera-name={cam.name}
                                    draggable={
                                        editing === null && cam.name !== CURRENT_CAMERA_NAME
                                    }
                                    onClick={() => setSelected(cam.name)}
                                    onDoubleClick={() => applyToView(cam.name, true)}
                                    onContextMenu={(e) => {
                                        e.preventDefault()
                                        setSelected(cam.name)
                                        void openMenu(cam, e.clientX, e.clientY)
                                    }}
                                    onDragStart={(e) => dnd.onDragStart(e, cam.name)}
                                    onDragOver={(e) => dnd.onDragOver(e, cam.name)}
                                    onDrop={(e) => dnd.onDrop(e, cam.name)}
                                    onDragEnd={dnd.onDragEnd}
                                >
                                    <AppIcon name="node.camera" aria-hidden />
                                    {editing === cam.name ? (
                                        <InlineRenameInput
                                            inputRef={renameRef}
                                            defaultValue={cam.name}
                                            onCommit={commitRename}
                                            onCancel={() => {
                                                setEditing(null)
                                                focusBody()
                                            }}
                                        />
                                    ) : (
                                        <span className="camera-row-name type-row">{cam.name}</span>
                                    )}
                                    {cam.visSize > 0 && (
                                        <AppIcon
                                            name="ui.eyeOpen"
                                            size="sm"
                                            className="camera-row-badge"
                                            title="Has saved show/hide state"
                                            aria-hidden
                                        />
                                    )}
                                    {cam.src !== '' && (
                                        <AppIcon
                                            name="ui.link"
                                            size="sm"
                                            className="camera-row-badge"
                                            title={cam.src}
                                            aria-hidden
                                        />
                                    )}
                                </ListRow>
                            ))}
                        </Listbox>
                    )}
                </div>
            )}
        </div>
    )
}
