/**
 * @file commands/ids.ts
 * @description Centralized command ID constants for the command registry.
 *
 * Using typed constants prevents typos and enables rename-refactoring.
 */

export const CmdId = {
  // Scene operations
  SceneNew:           'scene.new',           // no args
  SceneOpenObjPath:   'scene.openObjFromPath',    // args: FileOpenedData
  SceneOpenScenePath: 'scene.openSceneFromPath',  // args: string (file path)

  // Dialog triggers
  UiOpenObjDialog:    'ui.openObjDialog',    // no args
  UiOpenSceneDialog:  'ui.openSceneDialog',  // no args

  // Tab management
  TabNew:             'tab.new',             // no args
  TabClose:           'tab.close',           // args: string (tab id)

  // File operations
  FileSave:           'file.save',           // no args
} as const

export type CmdId = typeof CmdId[keyof typeof CmdId]
