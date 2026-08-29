/**
 * @file hooks/useCommandRegistrations.ts
 * @description Composes the per-domain command-registration hooks
 * (scene / dialog / tab / new-tab / edit / view) plus the Electron IPC bridge
 * into a single call so App.tsx stays focused on layout.
 *
 * Each underlying hook keeps its own typed options surface; this composer
 * merely passes through.
 */

import type { SceneBgColor, ViewCenterMark } from '@shared/types/menuState';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import type { ActiveSceneCommandDeps } from '../commands/commandTypes';
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
import type { NewSceneAction, OpenSceneFileAction } from './useNewSceneAction';

interface UseCommandRegistrationsOptions {
  cm: AsyncCueMol | null;
  getActiveSceneInfo: ActiveSceneCommandDeps;
  /** Id of the visible tab, read at dispatch time. */
  getActiveTabId: () => string;
  closeTab: (id: string) => Promise<boolean>;
  /** Open the Settings tab, or activate it when it is already open. */
  openSettingsTab: () => void;
  activeMolViewId: number | undefined;
  onProjectionChanged: (perspective: boolean) => void;
  onCenterMarkChanged: (centerMark: ViewCenterMark) => void;
  onBgColorChanged: (bgColor: SceneBgColor) => void;
  /** Open the active View in the generic property inspector. */
  showViewProperty: (viewId: number) => void;
  /** Open the active scene in the generic property inspector (Scene > Properties...). */
  showSceneProperty: (sceneId: number) => void;
  newScene: NewSceneAction;
  /** Open a scene file in its own tab (created only once it has loaded). */
  openSceneFile: OpenSceneFileAction;
}

export function useCommandRegistrations({
  cm,
  getActiveSceneInfo,
  getActiveTabId,
  closeTab,
  openSettingsTab,
  activeMolViewId,
  onProjectionChanged,
  onCenterMarkChanged,
  onBgColorChanged,
  showViewProperty,
  showSceneProperty,
  newScene,
  openSceneFile,
}: UseCommandRegistrationsOptions): void {
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
    getActiveViewId: () => activeMolViewId,
    onProjectionChanged,
    onCenterMarkChanged,
    showViewProperty,
  });
  useRenderCommands();
  useWindowCommands();
  useElectronIpc();
}
