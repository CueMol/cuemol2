import React from 'react'
import { DialogShell } from './DialogShell'
import { RendererOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/RendererOptionsPane'
import { useRendererOptions } from '@renderer/dialogs/fopen-opt-dlgs/useRendererOptions'
import type { PresetTypeEntry, RendererOptions } from '@renderer/dialogs/fopen-opt-dlgs/types'

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
 * The object-name field is editable and the edited value is returned in
 * `rendOpts.objectName`. The attach-to-existing-object flows (scene panel
 * "New Renderer") ignore it, matching UXP `bEditObjName=false`; the
 * "Create SYMM mol..." flow consumes it as the new object's name, matching
 * UXP `bEditObjName=true`.
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
        <DialogShell
            visible={visible}
            title={title}
            width="6xl"
            onCancel={onCancel}
            onOk={handleOk}
            okLabel="Create"
            okDisabled={!canSubmit}
            className="fod-dialog"
            bodyClassName="fod-body"
        >
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
        </DialogShell>
    )
}
