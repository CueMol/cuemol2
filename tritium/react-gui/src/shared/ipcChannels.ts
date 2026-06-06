/**
 * IPC channel name constants shared across main, preload, and renderer.
 *
 * Use these constants instead of raw strings to get compile-time safety
 * and a single place to update when channels change.
 */

export const IPC = {
  // invoke channels (renderer → main, with reply)
  APP_PATH:       'apppath',
  DIALOG_OPEN:    'dialog:openFile',
  DIALOG_SAVE_SCENE: 'dialog:saveScene',
  DIALOG_STYLE_OPEN: 'dialog:styleOpen',
  DIALOG_STYLE_SAVE: 'dialog:styleSave',
  DIALOG_CAMERA_OPEN: 'dialog:cameraOpen',
  DIALOG_CAMERA_SAVE: 'dialog:cameraSave',
  DIALOG_IMAGE_SAVE:  'dialog:imageSave',
  DIALOG_OBJECT_SAVE: 'dialog:objectSave',
  DIALOG_PICK_PATH:   'dialog:pickPath',
  SAVE_TEXT_AS:       'dialog:saveTextAs',
  FILE_EXISTS:        'file:exists',
  FILE_BACKUP_RENAME: 'file:backupRename',
  LAYOUT_LOAD:    'layout:load',
  LAYOUT_SAVE:    'layout:save',
  UI_LOAD:        'ui:load',
  UI_SAVE:        'ui:save',
  MENU_UPDATE_STATE: 'menu:update-state',
  MENU_SET_MODAL_BLOCKED: 'menu:set-modal-blocked',

  // File > Open Recent (MRU) — renderer ↔ main
  RECENT_LOAD:  'recent:load',
  RECENT_ADD:   'recent:add',
  RECENT_CLEAR: 'recent:clear',

  // push channels (main → renderer, no reply)
  OBJ_FILE_OPENED:   'file:obj-opened',
  SCENE_FILE_OPENED: 'file:scene-opened',
  FILE_ERROR:        'file:error',
  MENU_SAVE:      'menu:save',
  MENU_SAVE_SCENE_AS: 'menu:save-scene-as',
  MENU_NEW_TAB:   'menu:new-tab',
  MENU_CLOSE_TAB: 'menu:close-tab',
  MENU_NEW_SCENE: 'menu:new-scene',
  MENU_OPEN_FILE:  'menu:open-file',
  MENU_OPEN_SCENE: 'menu:open-scene',
  MENU_GET_PDB:    'menu:get-pdb',
  MENU_UNDO:      'menu:undo',
  MENU_REDO:      'menu:redo',
  MENU_VIEW_PERSPECTIVE:  'menu:view-perspective',
  MENU_VIEW_ORTHOGRAPHIC: 'menu:view-orthographic',
  MENU_CENTER_MARK_CROSS: 'menu:center-mark-cross',
  MENU_CENTER_MARK_AXIS:  'menu:center-mark-axis',
  MENU_CENTER_MARK_NONE:  'menu:center-mark-none',
  MENU_BG_WHITE:  'menu:bg-white',
  MENU_BG_BLACK:  'menu:bg-black',
  MENU_ABOUT:     'menu:about',
  MENU_OPEN_RECENT: 'menu:open-recent',
  RECENT_UPDATED:   'recent:updated',

  // invoke channels (renderer → main, with reply) — menu role actions
  MENU_INVOKE_ROLE: 'menu:invoke-role',

  // Window close / app quit lifecycle (red-button and Cmd+Q both funnel
  // through win.on('close'))
  WINDOW_CLOSE_REQUEST: 'window:close-request',
  WINDOW_CLOSE_PROCEED: 'window:close-proceed',

  // Renderer/Worker crash reporting + fallback UI's Quit button
  CRASH_REPORT: 'app:crash-report',
  FORCE_QUIT:   'app:force-quit',

  // invoke channel for native viewport context menu
  NAVI_CTX_SHOW: 'navi-ctx:show',

  // invoke channel for native scene-tree context menu (ScenePane right-click)
  SCENE_CTX_SHOW: 'scene-ctx:show',

  // gesture push channels (main → renderer)
  ROTATE_GESTURE: 'gesture:rotate',

  // generic push channel for menu items without specific handlers (main → renderer)
  MENU_GENERIC: 'menu:generic',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]
