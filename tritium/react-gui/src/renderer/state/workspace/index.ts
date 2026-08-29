/**
 * @file state/workspace/index.ts
 * @description The editor tab strip and the active scene it implies.
 */

export {
  WorkspaceProvider,
  useWorkspaceDispatch,
  useWorkspaceTabs,
  useActiveScene,
} from './WorkspaceProvider'
export type { WorkspaceDispatch, WorkspaceTabs, ActiveScene, MolViewEntry } from './WorkspaceProvider'
export {
  workspaceReducer,
  INITIAL_WORKSPACE,
  SETTINGS_TAB_ID,
  molViewTabId,
  activeTabOf,
  activeMolViewOf,
  molViewTabsOf,
} from './workspaceReducer'
export type { WorkspaceState, WorkspaceAction } from './workspaceReducer'
