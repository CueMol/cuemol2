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

  // push channels (main → renderer, no reply)
  FILE_OPENED:    'file:opened',
  FILE_ERROR:     'file:error',
  MENU_SAVE:      'menu:save',
  MENU_NEW_TAB:   'menu:new-tab',
  MENU_CLOSE_TAB: 'menu:close-tab',
  MENU_NEW_SCENE: 'menu:new-scene',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]
