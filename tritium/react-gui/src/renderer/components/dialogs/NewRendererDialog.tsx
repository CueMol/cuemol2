import React from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTheme } from '../../contexts/ThemeContext'
import { RendererOptionsPane } from '../fopen-opt-dlgs/panes/RendererOptionsPane'
import { useRendererOptions } from '../fopen-opt-dlgs/useRendererOptions'
import type { PresetTypeEntry, RendererOptions } from '../fopen-opt-dlgs/types'

/**
 * "New Renderer" dialog -- reuses the same `RendererOptionsPane` the file-
 * open flow uses. Mirrors the UXP `setupRenderer.xul` dialog, which also
 * shares its renderer-options tab with the file-open dialog
 * (`fopen-renderopt-page.xul`).
 *
 * Renderer-type history and default-renderer-name follow are provided by
 * the shared `useRendererOptions` hook -- the same behaviour layer the
 * file-open dialog uses.
 *
 * The object-name field is not editable here because we are attaching to
 * an existing object -- UXP's same dialog sets `bEditObjName=false` when
 * called from `setupRendByObjID`.
 */
export interface NewRendererDialogResult {
    rendOpts: RendererOptions
}

interface Props {
    visible: boolean
    /** Pre-fetched data from the worker (compatible types, default name). */
    objName: string
    objClassName: string
    rendererTypes: string[]
    /** Renderer presets for the leading "Presets" optgroup. */
    presetTypes?: PresetTypeEntry[]
    defaultName: string
    sceneId: number
    /** Target molecule uid -- forwarded to MolSelList for `current (<sel>)`. */
    molID?: number
    isMol: boolean
    /** The target mol's current selection; non-empty starts the Selection
     *  checkbox on, targeting that selection. */
    currentSel?: string
    /** Optional group label appended to the dialog title for context. */
    groupName?: string
    onConfirm: (result: NewRendererDialogResult) => void
    onCancel: () => void
}

export function NewRendererDialog({
    visible,
    objName,
    objClassName,
    rendererTypes,
    presetTypes,
    defaultName,
    sceneId,
    molID,
    isMol,
    currentSel,
    groupName,
    onConfirm,
    onCancel,
}: Props): React.JSX.Element {
    const { theme } = useTheme()
    const isDark = theme === 'dark'

    const { options, setOptions, onRendererNameUserEdit, commitHistory } =
        useRendererOptions({
            visible,
            sceneId,
            objClassName,
            rendererTypes,
            presetTypes,
            objectName: objName,
            initialRendererName: defaultName,
            initialSelection: currentSel,
        })

    const canSubmit =
        (rendererTypes.length > 0 || (presetTypes?.length ?? 0) > 0) &&
        (!!options.presetName || options.rendererType.length > 0) &&
        options.rendererName.trim().length > 0

    const handleOk = (): void => {
        if (!canSubmit) return
        commitHistory()
        onConfirm({
            rendOpts: {
                ...options,
                rendererName: options.rendererName.trim(),
            },
        })
    }

    const title = groupName
        ? `New Renderer (group: ${groupName})`
        : 'New Renderer'

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title={title}
            className="fod-dialog"
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody className="fod-body">
                <div className="fod-file-info">
                    <span className="fod-file-name" title={objName}>{objName || '(no object)'}</span>
                    {objClassName && (
                        <span className="fod-file-format">{objClassName}</span>
                    )}
                </div>
                <RendererOptionsPane
                    options={options}
                    onChange={setOptions}
                    rendererTypes={rendererTypes}
                    presetTypes={presetTypes}
                    sceneId={sceneId}
                    molID={molID}
                    isMolFormat={isMol}
                    onRendererNameUserEdit={onRendererNameUserEdit}
                />
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onCancel}>Cancel</Button>
                        <Button intent="primary" onClick={handleOk} disabled={!canSubmit}>
                            Create
                        </Button>
                    </>
                }
            />
        </Dialog>
    )
}
