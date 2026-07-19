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
  UiOpenTrajDialog:   'ui.openTrajDialog',   // no args -- MD trajectory open flow
  UiOpenSceneDialog:  'ui.openSceneDialog',  // no args
  UiAboutDialog:      'ui.aboutDialog',      // no args
  UiGetPdbDialog:     'ui.getPdbDialog',     // no args
  UiChangeChainIdDialog: 'ui.changeChainIdDialog', // no args
  UiDeleteMolDialog:  'ui.deleteMolDialog',  // no args
  UiChangeResidueIndexDialog: 'ui.changeResidueIndexDialog', // no args
  UiMergeMolDialog:   'ui.mergeMolDialog',   // no args
  UiMakeMolSurfDialog: 'ui.makeMolSurfDialog', // no args
  UiCalcApbsPotDialog: 'ui.calcApbsPotDialog', // no args
  UiInteractionAnalysisDialog: 'ui.interactionAnalysisDialog', // no args
  UiCutSurfByPlaneDialog: 'ui.cutSurfByPlaneDialog', // no args
  UiReassignProt2ndryDialog: 'ui.reassignProt2ndryDialog', // no args
  UiMolSuperpose:     'ui.molSuperpose',     // no args

  // Tab management
  TabNew:             'tab.new',             // no args
  TabClose:           'tab.close',           // args: string (tab id)

  // File operations
  FileSave:           'file.save',           // no args
  FileSaveAs:         'file.saveAs',         // no args
  ObjectSaveAs:       'object.saveAs',       // no args -- object (not scene) save
  SaveCurrentView:    'file.saveCurrentView', // no args
  // Export scene -- one command per file type (exporter). UXP `exportScene`.
  ExportPng:          'scene.export.png',     // no args -- export scene as PNG
  ExportUmbreon:      'scene.export.umbreon', // no args -- Umbreon ray-traced PNG
  ExportPov:          'scene.export.pov',     // no args -- POV-Ray SDL
  ExportStl:          'scene.export.stl',     // no args -- StereoLithography
  ExportMqo:          'scene.export.mqo',     // no args -- Metasequoia object
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
  UiViewProperty:     'ui.viewProperty',     // no args -- open active view in inspector

  // Scene style
  SceneBgWhite: 'scene.bg.white', // no args
  SceneBgBlack: 'scene.bg.black', // no args
  SceneColorProof: 'scene.colorProof', // no args -- toggle color proofing on active scene
  SceneProperties: 'scene.properties', // no args -- open active scene in inspector

  // Rendering
  UiRenderWindow:     'ui.renderWindow', // no args -- open/focus the Rendering window
} as const

export type CmdId = typeof CmdId[keyof typeof CmdId]
