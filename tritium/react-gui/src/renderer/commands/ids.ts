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
  UiMorphAnimDialog:  'ui.morphAnimDialog',  // no args -- morph animation setup

  // Tab management
  TabNew:             'tab.new',             // no args
  TabClose:           'tab.close',           // args: string (tab id)
  TabCloseActive:     'tab.closeActive',     // no args -- the tab menu item

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
  ClearUndo:          'edit.clearUndo',      // no args -- discard undo/redo history
  // Focus-routed edit actions. The Edit menu means "whatever has focus": a
  // text field gets the native edit, the scene tree gets node copy/paste, the
  // paint deck gets row copy/paste, and undo/redo fall through to the scene
  // commands above only when no field is focused. The toolbar buttons stay on
  // the plain scene Undo / Redo.
  EditSelectAll:      'edit.selectAll',      // no args
  EditCut:            'edit.cut',            // no args
  EditCopy:           'edit.copy',           // no args
  EditPaste:          'edit.paste',          // no args
  EditUndoFocused:    'edit.undoFocused',    // no args
  EditRedoFocused:    'edit.redoFocused',    // no args

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
  // ...and the two mode-selecting entry points (Rendering menu). Same window;
  // they also activate its Still / Movie output mode.
  UiRenderWindowImage: 'ui.renderWindow.image', // no args
  UiRenderWindowMovie: 'ui.renderWindow.movie', // no args

  // Window switching
  WindowFocusMain:    'window.focusMain', // no args -- raise the main window

  // App settings
  UiSettingsTab:      'ui.settingsTab', // no args -- open/activate the Settings tab
  RecentClear:        'recent.clear',   // no args -- empty the MRU list

  // --- Scene tree ---
  //
  // Everything the scene-tree context menu offers. The ones that also have a
  // second entry point (a toolbar button, a keyboard shortcut, a
  // double-click) take the ids they act on as args rather than reading a
  // selection, so every entry point resolves its own target and lands on one
  // handler.
  SceneNodeSetVisible:   'scene.node.setVisible',   // args: { ids; visible }
  SceneNodeDelete:       'scene.node.delete',       // args: { ids }
  SceneNodeCopy:         'scene.node.copy',         // args: { ids }
  SceneNodePaste:        'scene.node.paste',        // args: { targetId }
  SceneNodeRenameBegin:  'scene.node.renameBegin',  // args: { id }
  SceneNodeProperty:     'scene.node.property',     // args: { id }
  SceneNodeSelectMol:    'scene.node.selectMol',    // args: { id; selectKind }

  // Renderer / object operations, all scoped to a node id.
  RendererNew:           'scene.renderer.new',           // args: { sourceNodeId }
  RendererNewGroup:      'scene.renderer.newGroup',      // args: { objId }
  RendererSetColoring:   'scene.renderer.setColoring',   // args: { id; coloringId }
  RendererPaint:         'scene.renderer.paint',         // args: { id; colorValue }
  RendererApplyStyle:    'scene.renderer.applyStyle',    // args: { id; styleName; pattern; flags }
  RendererSetSelection:  'scene.renderer.setSelection',  // args: { id; selKind }
  RendererGenSurfObj:    'scene.renderer.generateSurfObj', // args: { id }
  RendererChangeType:    'scene.renderer.changeType',    // args: { id; typeName }
  RendererEditStyle:     'scene.renderer.editStyle',     // args: { id }
  RendererCreateStyle:   'scene.renderer.createStyle',   // args: { id }
  RendererEditIntrList:  'scene.renderer.editInteractionList', // args: { id; rendName }
  ObjectRegenSurface:    'scene.object.regenSurface',    // args: { objId }

  // Style sets.
  StyleNew:              'scene.style.new',              // no args
  StyleEdit:             'scene.style.edit',             // args: { id; scopeId; name }
  StyleToggleReadOnly:   'scene.style.toggleReadOnly',   // args: { id; scopeId }
  StyleLoadFromFile:     'scene.style.load',             // no args
  StyleReload:           'scene.style.reload',           // no args
  StyleSave:             'scene.style.save',             // args: { id; scopeId; name }
  StyleSaveAs:           'scene.style.saveAs',           // args: { id; scopeId; name }

  // Cameras.
  CameraNew:             'scene.camera.new',             // no args
  CameraLoadFromFile:    'scene.camera.load',            // no args
  CameraReload:          'scene.camera.reload',          // args: { name }
  CameraSave:            'scene.camera.save',            // args: { name }
  CameraSaveAs:          'scene.camera.saveAs',          // args: { name }
  CameraSaveFromView:    'scene.camera.saveFromView',    // args: { name; withVisFlags }
  CameraApplyToView:     'scene.camera.applyToView',     // args: { name; withVisFlags }
  CameraEditVisFlags:    'scene.camera.editVisFlags',    // args: { name }
  CameraClearVisFlags:   'scene.camera.clearVisFlags',   // args: { name }
} as const

export type CmdId = typeof CmdId[keyof typeof CmdId]
