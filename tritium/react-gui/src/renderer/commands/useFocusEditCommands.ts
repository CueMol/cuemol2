/**
 * @file commands/useFocusEditCommands.ts
 * @description Registers the Edit-menu actions that resolve by FOCUS rather
 * than to a fixed target.
 *
 * The Edit menu means "whatever has focus": a text field gets the native
 * edit, the scene tree gets node copy/paste, the paint deck gets row
 * copy/paste (see utils/editClipboard.ts), and Select All is scoped to the
 * focused field or region rather than the whole document (see
 * utils/selectAllScope.ts).
 *
 * Undo / Redo fall through to the scene-level `CmdId.Undo` / `CmdId.Redo`
 * only when no text field has focus -- there the user means their typing, not
 * the scene. The toolbar buttons bypass this and dispatch the scene commands
 * directly.
 *
 * These used to live as special cases inside `useMenuDispatch`, which meant
 * the menu had two kinds of entry: real commands and markers the dispatcher
 * knew about. They are commands now, so every menu entry resolves the same
 * way and a second entry point (a shortcut, a toolbar, a context menu) can
 * reach them.
 */

import { useCommands, useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { selectAllInScope } from '@renderer/utils/selectAllScope'
import { dispatchEditClipboard, dispatchEditUndoRedo } from '@renderer/utils/editClipboard'

export function useFocusEditCommands(): void {
    const { dispatch } = useCommands()
    const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)

    useRegisterCommand(CmdId.EditSelectAll, () => {
        selectAllInScope()
    })

    useRegisterCommand(CmdId.EditCut, () => {
        dispatchEditClipboard('cut')
    })
    useRegisterCommand(CmdId.EditCopy, () => {
        dispatchEditClipboard('copy')
    })
    useRegisterCommand(CmdId.EditPaste, () => {
        dispatchEditClipboard('paste')
    })

    useRegisterCommand(CmdId.EditUndoFocused, () => {
        // Handled natively by the focused text field, or fall through.
        if (dispatchEditUndoRedo('undo')) return
        dispatch(CmdId.Undo).catch(logErr('edit.undo:'))
    })
    useRegisterCommand(CmdId.EditRedoFocused, () => {
        if (dispatchEditUndoRedo('redo')) return
        dispatch(CmdId.Redo).catch(logErr('edit.redo:'))
    })
}
