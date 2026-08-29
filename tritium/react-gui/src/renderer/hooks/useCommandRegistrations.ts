/**
 * @file hooks/useCommandRegistrations.ts
 * @description Composes the per-domain command-registration hooks
 * (scene / dialog / tab / new-tab / edit / view / ...) plus the Electron IPC
 * bridge into a single call.
 *
 * Everything the handlers need comes from the app-state providers, so this
 * takes no arguments; App only has to mount it.
 */

import { useCueMol } from './cuemol/useCueMol';
import { useWorkspaceDispatch } from '../state/workspace';
import { useActiveViewDispatch } from '../state/activeView';
import { useInspectorActions } from '../state/inspector';
import { useNewSceneAction, useOpenSceneFileAction } from './useNewSceneAction';
import { useSceneCommands } from '../commands/useSceneCommands';
import { useUiDialogCommands } from '../commands/useUiDialogCommands';
import { useTabCommands } from '../commands/useTabCommands';
import { useFocusEditCommands } from '../commands/useFocusEditCommands';
import { useNewTabCommand } from '../commands/useNewTabCommand';
import { useEditCommands } from '../commands/useEditCommands';
import { useToolCommands } from '../commands/useToolCommands';
import { useFileCommands } from '../commands/useFileCommands';
import { useViewCommands } from '../commands/useViewCommands';
import { useRenderCommands } from '../commands/useRenderCommands';
import { useWindowCommands } from '../commands/useWindowCommands';
import { useElectronIpc } from './useElectronIpc';

export function useCommandRegistrations(): void {
  const { cm } = useCueMol();
  const { getActiveSceneInfo, getActiveTabId, closeTab, openSettingsTab, getActiveViewId } =
    useWorkspaceDispatch();
  const { onProjectionChanged, onCenterMarkChanged, onBgColorChanged } = useActiveViewDispatch();
  const { showView: showViewProperty, showScene: showSceneProperty } = useInspectorActions();
  // Shared "create scene + view + register tab" action (UXP onNewScene
  // equivalent); a scene FILE goes through its own action so a failed open
  // never leaves an empty molview tab behind.
  const newScene = useNewSceneAction({ cm });
  const openSceneFile = useOpenSceneFileAction({ cm });

  useSceneCommands({ cm, getActiveSceneInfo, onBgColorChanged, showSceneProperty, newScene, openSceneFile });
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
