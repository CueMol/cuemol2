/**
 * @file hooks/useCommandRegistrations.ts
 * @description Composes the per-domain command-registration hooks
 * (scene / dialog / tab / new-tab / edit / view / ...) plus the Electron IPC
 * bridge into a single call.
 *
 * Everything the handlers need comes from the app-state providers, so this
 * takes no arguments; App only has to mount it.
 */

import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useWorkspaceDispatch } from '@renderer/state/workspace';
import { useActiveViewDispatch } from '@renderer/state/activeView';
import { useInspectorActions } from '@renderer/state/inspector';
import { useNewSceneAction, useOpenSceneFileAction } from './useNewSceneAction';
import { useSceneCommands } from '@renderer/commands/useSceneCommands';
import { useUiDialogCommands } from '@renderer/commands/useUiDialogCommands';
import { useTabCommands } from '@renderer/commands/useTabCommands';
import { useFocusEditCommands } from '@renderer/commands/useFocusEditCommands';
import { useNewTabCommand } from '@renderer/commands/useNewTabCommand';
import { useEditCommands } from '@renderer/commands/useEditCommands';
import { useToolCommands } from '@renderer/commands/useToolCommands';
import { useFileCommands } from '@renderer/commands/useFileCommands';
import { useViewCommands } from '@renderer/commands/useViewCommands';
import { useRenderCommands } from '@renderer/commands/useRenderCommands';
import { useWindowCommands } from '@renderer/commands/useWindowCommands';
import { useElectronIpc } from './useElectronIpc';

export function useCommandRegistrations(): void {
  const { cm } = useCueMol();
  const { getActiveSceneInfo, getActiveTabId, closeTab, openSettingsTab, getActiveViewId } =
    useWorkspaceDispatch();
  const { onProjectionChanged, onCenterMarkChanged, onBgColorChanged, onColorProofingChanged } =
    useActiveViewDispatch();
  const { showView: showViewProperty, showScene: showSceneProperty } = useInspectorActions();
  // Shared "create scene + view + register tab" action (UXP onNewScene
  // equivalent); a scene FILE goes through its own action so a failed open
  // never leaves an empty molview tab behind.
  const newScene = useNewSceneAction({ cm });
  const openSceneFile = useOpenSceneFileAction({ cm });

  useSceneCommands({
    cm, getActiveSceneInfo, onBgColorChanged, onColorProofingChanged,
    showSceneProperty, newScene, openSceneFile,
  });
  useUiDialogCommands({ cm });
  useTabCommands({ closeTab, openSettingsTab, getActiveTabId });
  useNewTabCommand({ cm, getActiveSceneInfo, newScene });
  useEditCommands({ cm, getActiveSceneInfo });
  useFocusEditCommands();
  useToolCommands({ cm, getActiveSceneInfo });
  useFileCommands({ cm, getActiveSceneInfo });
  useViewCommands({
    cm,
    getActiveViewId,
    onProjectionChanged,
    onCenterMarkChanged,
    showViewProperty,
  });
  useRenderCommands();
  useWindowCommands();
  useElectronIpc();
}
