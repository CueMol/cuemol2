/**
 * @file plugin-host/api.ts
 * @description What a built-in plugin is meant to build against.
 *
 * A deliberately narrow surface: the declaration helpers, the two lanes a
 * plugin owns (its commands and its worker services), and the handful of app
 * hooks a pane or a dialog genuinely needs. Everything else -- the design
 * system in `h3-kit`, the shared types -- is imported from its own barrel as
 * usual.
 *
 * Keeping it narrow is the point. This is the seam that has to survive the
 * move to runtime-loaded plugins (Phase A of the plugin plan), where a
 * plugin can no longer reach into `@renderer/**` at all.
 */

// --- Declaring a plugin ---
export { definePlugin, validatePlugin } from './definePlugin'
export type {
  BottomTabComponent,
  BottomTabComponentProps,
  PaneComponent,
  PaneComponentProps,
  PluginCommandId,
  PluginManifest,
  PluginSettingControl,
  PluginSettingDecl,
  RendererPlugin,
} from './types'

// --- The command lane ---
export { useRegisterPluginCommand } from './usePluginCommand'
export { useCommands } from '@renderer/commands/CommandRegistry'

// --- The worker-service lane ---
export { definePluginServices } from './pluginServices'
export type { PluginServiceCalls, PluginServiceClient } from './pluginServices'
export type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
export type { InvokeOptions } from '@renderer/worker/client/WorkerTransport'

// --- The push-channel lane (worker -> renderer, no reply) ---
export { definePluginChannel } from './pluginChannels'
export type { PluginChannel } from './pluginChannels'

// --- Preferences and secrets ---
export { usePluginPrefs } from './usePluginPrefs'
export type { PluginPrefs } from './usePluginPrefs'
export type { PluginPrefValue } from '@shared/types/uiPrefs'
export { definePluginSecret } from './pluginSecrets'
export type { PluginSecret } from './pluginSecrets'

// --- App state a pane or dialog needs ---
export { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
export { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'
export type { UseCueMolEventListenerOptions } from '@renderer/hooks/cuemol/useCueMolEventListener'
// The fetch + auto-refresh engine every panel hook is built on. Exported
// because a pane that fetches has to have the stale-fetch guard, and
// hand-rolling that one is exactly what tritium/CLAUDE.md forbids.
export { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
export type {
  LiveFetchListener,
  UseLiveFetchOptions,
  UseLiveFetchResult,
} from '@renderer/hooks/cuemol/useLiveFetch'
export { useActiveScene } from '@renderer/state/workspace'
export { useEnsureActiveScene } from '@renderer/hooks/useEnsureActiveScene'
// Hold Undo / Redo off while the plugin is in the middle of an edit the user
// must not be able to unwind halfway.
export { useSuppressUndoRedo } from '@renderer/contexts/UndoRedoLockContext'

// --- Shell chrome a pane is built from ---
export { PaneSectionHeader } from '@renderer/shell/PaneSectionHeader'

// --- Dialogs ---
export { createDialogHook, createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'
export { DialogShell } from '@renderer/dialogs/DialogShell'
export { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider'
export { useStreamProgressDialog } from '@renderer/dialogs/StreamProgressDialogProvider'
export type { StreamProgressApi } from '@renderer/dialogs/StreamProgressDialogProvider'
export { useShowFileOpenOptionDialog } from '@renderer/dialogs/fopen-opt-dlgs/FileOpenOptionDialogProvider'
// Pick the initial renderer for an object a plugin is about to load. Core
// mounts the provider, so a plugin calls the hook without mounting anything.
export { useShowNewRendererDialog } from '@renderer/dialogs/NewRendererDialogProvider'
export type { NewRendererDialogArgs } from '@renderer/dialogs/NewRendererDialogProvider'
