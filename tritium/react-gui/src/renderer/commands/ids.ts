/**
 * @file commands/ids.ts
 * @description Centralized command ID constants for the command registry.
 *
 * Using typed constants prevents typos and enables rename-refactoring.
 */

export const CmdId = {
  // Scene operations
  SceneNew:           'scene.new',           // no args
  OpenObjByPath:      'scene.openObjFromPath',    // args: FileOpenedData
  OpenSceneByPath:    'scene.openSceneFromPath',  // args: string (file path)

  // Dialog triggers
  UiOpenObjDialog:    'ui.openObjDialog',    // no args
  UiOpenSceneDialog:  'ui.openSceneDialog',  // no args
  UiAboutDialog:      'ui.aboutDialog',      // no args
  UiGetPdbDialog:     'ui.getPdbDialog',     // no args

  // Tab management
  TabNew:             'tab.new',             // no args
  TabClose:           'tab.close',           // args: string (tab id)

  // File operations
  FileSave:           'file.save',           // no args
  FileSaveAs:         'file.saveAs',         // no args
  ObjectSaveAs:       'object.saveAs',       // no args -- object (not scene) save
  SaveCurrentView:    'file.saveCurrentView', // no args
  SceneReload:        'scene.reload',        // no args

  // Undo/redo
  Undo:               'edit.undo',           // no args
  Redo:               'edit.redo',           // no args

  // View operations
  ViewPerspective:    'view.perspective',    // no args
  ViewOrthographic:   'view.orthographic',   // no args
  ViewCenterMarkCross: 'view.centerMark.cross', // no args
  ViewCenterMarkAxis:  'view.centerMark.axis',  // no args
  ViewCenterMarkNone:  'view.centerMark.none',  // no args

  // Scene style
  SceneBgWhite: 'scene.bg.white', // no args
  SceneBgBlack: 'scene.bg.black', // no args
} as const

export type CmdId = typeof CmdId[keyof typeof CmdId]
