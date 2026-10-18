/**
 * @file features/actions/useLibraryCommands.ts
 * @description Handlers for the Action library: running a preset or a saved
 * action, saving History steps into User Actions (as recorded, or as a macro),
 * copying a preset there, and renaming / deleting the user's files.
 *
 * Running is the only command that changes the scene, and it is offered as
 * an explicit button or menu item, never on a double-click.
 */

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from '@renderer/commands/commandTypes'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider'
import { useShowTextPromptDialog } from '@renderer/dialogs/TextPromptDialogProvider'
import { useShowSaveActionDialog } from '@renderer/dialogs/SaveActionDialogProvider'
import { isUserFile, libraryPaths, notifyLibraryChanged } from './libraryOps'

export interface LibraryCommandsOptions {
  cm: AsyncCueMol | null
  getActiveSceneInfo: ActiveSceneCommandDeps
}

/** A name a person typed, made safe as a file name. */
function fileNameOf(text: string): string {
  return text.trim().replace(/[\\/:*?"<>|]/g, '_')
}

/** `/a/b/name.qax` -> `name`. */
function baseName(file: string): string {
  const n = file.split(/[\\/]/).pop() ?? file
  return n.replace(/\.qax$/i, '')
}

export function useLibraryCommands({ cm, getActiveSceneInfo }: LibraryCommandsOptions): void {
  const showErrorAlert = useShowErrorAlert()
  const prompt = useShowTextPromptDialog()
  const showSave = useShowSaveActionDialog()

  const fail = (title: string, message: string): Promise<void> => showErrorAlert({ title, message })

  useRegisterCommand(CmdId.LibraryRun, async ({ file, macro, targetIds }) => {
    const info = getActiveSceneInfo()
    if (!cm || !info) return
    const res = await cm.invokeService('runLibraryEntry', {
      sceneId: info.scene_uid,
      viewId: info.view_id,
      file,
      ...(macro !== undefined ? { macro } : {}),
      ...(targetIds ? { targetIds } : {}),
    })
    if (!res.ok) {
      await fail('Run Action', res.error)
      return
    }
    if (res.failures.length > 0) {
      const lines = res.failures.map((f) => `${f.target}: ${f.error}`).join('\n')
      await fail('Run Action', `It ran on ${res.done} object(s); these were skipped:\n${lines}`)
    }
  })

  useRegisterCommand(CmdId.ActionsSaveToLibrary, async ({ stepIds }) => {
    const info = getActiveSceneInfo()
    if (!cm || !info || stepIds.length === 0) return
    // Whether the steps can be a macro decides what the dialog offers.
    const check = await cm.invokeService('canSaveAsMacro', { sceneId: info.scene_uid, stepIds })
    const choice = await showSave({ macroBlock: check.ok ? null : check.error })
    if (choice === null) return
    const name = fileNameOf(choice.name)
    if (name === '') return
    const paths = await libraryPaths()
    const res = await cm.invokeService('saveStepsToLibrary', {
      sceneId: info.scene_uid,
      stepIds,
      userDir: paths.userDir,
      name,
      label: choice.name,
      asMacro: choice.asMacro,
    })
    if (!res.ok) await fail('Save to Actions', res.error)
    notifyLibraryChanged()
  })

  useRegisterCommand(CmdId.LibraryCopyMacro, async ({ file, macro }) => {
    if (!cm) return
    const paths = await libraryPaths()
    const res = await cm.invokeService('copyMacroToLibrary', { file, macro, userDir: paths.userDir })
    if (!res.ok) await fail('Copy to User Actions', res.error)
    notifyLibraryChanged()
  })

  useRegisterCommand(CmdId.LibraryRename, async ({ file }) => {
    if (!cm) return
    const paths = await libraryPaths()
    if (!isUserFile(paths, file)) return
    const typed = await prompt({ title: 'Rename', label: 'Name', defaultValue: baseName(file), confirmLabel: 'Rename' })
    if (typed === null) return
    const name = fileNameOf(typed)
    if (name === '' || name === baseName(file)) return
    const res = await cm.invokeService('renameLibraryFile', { file, name, userDir: paths.userDir })
    if (!res.ok) await fail('Rename', res.error)
    notifyLibraryChanged()
  })

  useRegisterCommand(CmdId.LibraryDelete, async ({ file }) => {
    const paths = await libraryPaths()
    if (!isUserFile(paths, file)) return
    // To the trash, so a mistake can be undone there.
    const res = await window.electronAPI.invoke(IPC.SHELL_TRASH_PATH, { path: file })
    if (!res.ok) await fail('Delete', res.error ?? 'The file could not be moved to the trash.')
    notifyLibraryChanged()
  })
}
