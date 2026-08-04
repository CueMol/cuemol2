/**
 * @file hooks/useCommandRegistrations.ts
 * @description Composes the per-domain command-registration hooks
 * (scene / dialog / tab / new-tab / edit / view) plus the Electron IPC bridge
 * into a single call so App.tsx stays focused on layout.
 *
 * Each underlying hook keeps its own typed options surface; this composer
 * merely passes through.
 */

import type { SceneBgColor, ViewCenterMark } from '../../shared/ipcTypes';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import type { ActiveSceneCommandDeps } from '../commands/commandTypes';
import { useSceneCommands } from '../commands/useSceneCommands';
import { useUiDialogCommands } from '../commands/useUiDialogCommands';
import { useTabCommands } from '../commands/useTabCommands';
import { useNewTabCommand } from '../commands/useNewTabCommand';
import { useEditCommands } from '../commands/useEditCommands';
import { useToolCommands } from '../commands/useToolCommands';
import { useFileCommands } from '../commands/useFileCommands';
import { useViewCommands } from '../commands/useViewCommands';
import { useRenderCommands } from '../commands/useRenderCommands';
import { useWindowCommands } from '../commands/useWindowCommands';
import { useElectronIpc } from './useElectronIpc';
import type { NewSceneAction } from './useNewSceneAction';

interface UseCommandRegistrationsOptions {
  cm: AsyncCueMol | null;
  addMolTab: (title: string, viewId: number, sceneId: number) => void;
  addMolViewTab: (title: string, viewId: number) => void;
  getActiveSceneInfo: ActiveSceneCommandDeps;
  handleCloseTab: (id: string) => Promise<boolean>;
  /** Open the Settings tab, or activate it when it is already open. */
  openSettingsTab: () => void;
  activeTab: string | null;
  activeMolViewId: number | undefined;
  onProjectionChanged: (perspective: boolean) => void;
  onCenterMarkChanged: (centerMark: ViewCenterMark) => void;
  onBgColorChanged: (bgColor: SceneBgColor) => void;
  /** Open the active View in the generic property inspector. */
  showViewProperty: (viewId: number) => void;
  /** Open the active scene in the generic property inspector (Scene > Properties...). */
  showSceneProperty: (sceneId: number) => void;
  newScene: NewSceneAction;
}

export function useCommandRegistrations({
  cm,
  addMolTab,
  addMolViewTab,
  getActiveSceneInfo,
  handleCloseTab,
  openSettingsTab,
  activeTab,
  activeMolViewId,
  onProjectionChanged,
  onCenterMarkChanged,
  onBgColorChanged,
  showViewProperty,
  showSceneProperty,
  newScene,
}: UseCommandRegistrationsOptions): void {
  useSceneCommands({ cm, getActiveSceneInfo, onBgColorChanged, showSceneProperty, newScene });
  useUiDialogCommands({ cm });
  useTabCommands({ handleCloseTab, openSettingsTab });
  useNewTabCommand({ cm, addMolTab, addMolViewTab, getActiveSceneInfo, newScene });
  useEditCommands({ cm, getActiveSceneInfo });
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
  useElectronIpc(activeTab);
}
