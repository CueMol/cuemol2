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
  LAYOUT_LOAD:    'layout:load',
  LAYOUT_SAVE:    'layout:save',
  UI_LOAD:        'ui:load',
  UI_SAVE:        'ui:save',
  MENU_UPDATE_STATE: 'menu:update-state',

  // push channels (main → renderer, no reply)
  OBJ_FILE_OPENED:   'file:obj-opened',
  SCENE_FILE_OPENED: 'file:scene-opened',
  FILE_ERROR:        'file:error',
  MENU_SAVE:      'menu:save',
  MENU_NEW_TAB:   'menu:new-tab',
  MENU_CLOSE_TAB: 'menu:close-tab',
  MENU_NEW_SCENE: 'menu:new-scene',
  MENU_OPEN_FILE:  'menu:open-file',
  MENU_OPEN_SCENE: 'menu:open-scene',
  MENU_UNDO:      'menu:undo',
  MENU_REDO:      'menu:redo',
  MENU_VIEW_PERSPECTIVE:  'menu:view-perspective',
  MENU_VIEW_ORTHOGRAPHIC: 'menu:view-orthographic',

  // invoke channels (renderer → main, with reply) — menu role actions
  MENU_INVOKE_ROLE: 'menu:invoke-role',

  // invoke channel for native viewport context menu
  NAVI_CTX_SHOW: 'navi-ctx:show',

  // gesture push channels (main → renderer)
  ROTATE_GESTURE: 'gesture:rotate',

  // generic push channel for menu items without specific handlers (main → renderer)
  MENU_GENERIC: 'menu:generic',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]
