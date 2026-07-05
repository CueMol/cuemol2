/**
 * IPC channel name constants shared across main, preload, and renderer.
 *
 * Use these constants instead of raw strings to get compile-time safety
 * and a single place to update when channels change.
 */

export const IPC = {
  // invoke channels (renderer -> main, with reply)
  APP_PATH:       'apppath',
  DIALOG_OPEN:    'dialog:openFile',
  DIALOG_SAVE_SCENE: 'dialog:saveScene',
  DIALOG_STYLE_OPEN: 'dialog:styleOpen',
  DIALOG_STYLE_SAVE: 'dialog:styleSave',
  DIALOG_CAMERA_OPEN: 'dialog:cameraOpen',
  DIALOG_CAMERA_SAVE: 'dialog:cameraSave',
  DIALOG_SCENE_EXPORT: 'dialog:sceneExport',
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

  // File > Open Recent (MRU) -- renderer <-> main
  RECENT_LOAD:  'recent:load',
  RECENT_ADD:   'recent:add',
  RECENT_CLEAR: 'recent:clear',

  // push channels (main -> renderer, no reply)
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

  // --- Menu action channels (carried as the payload of MENU_GENERIC, or
  // sent on their own dedicated push channel). Single source of truth for the
  // menu-action strings so menuTemplate / menu.ts / useMenuDispatch agree. ---
  MENU_NEW_WINDOW:    'menu:new-window',
  MENU_CLEAR_RECENT:  'menu:clear-recent',
  MENU_SAVE_FILE_AS:  'menu:save-file-as',
  MENU_SAVE_CURRENT_VIEW: 'menu:save-current-view',
  MENU_RELOAD_SCENE:  'menu:reload-scene',
  MENU_SELECT_ALL:    'menu:select-all',
  MENU_CLEAR_UNDO:    'menu:clear-undo',
  MENU_MERGE_MOL:     'menu:merge-mol',
  MENU_DELETE_MOL_ATOMS: 'menu:delete-mol-atoms',
  MENU_CHANGE_CHAIN_ID:  'menu:change-chain-id',
  MENU_CHANGE_RESID_NUM: 'menu:change-resid-num',
  MENU_OPTIONS:       'menu:options',
  MENU_POV_RENDER:    'menu:pov-render',
  MENU_ANIM_RENDER:   'menu:anim-render',
  MENU_EXPORT_PNG:     'menu:export-png',
  MENU_EXPORT_UMBREON: 'menu:export-umbreon',
  MENU_EXPORT_POV:     'menu:export-pov',
  MENU_EXPORT_STL:     'menu:export-stl',
  MENU_EXPORT_MQO:     'menu:export-mqo',
  MENU_COLOR_PROOF:   'menu:color-proof',
  MENU_SCENE_PROPS:   'menu:scene-props',
  MENU_VIEW_PROPS:    'menu:view-props',
  MENU_MOL_SUPERPOSE: 'menu:mol-superpose',
  MENU_BOND_EDITOR:   'menu:bond-editor',
  MENU_INTERACTION:   'menu:interaction',
  MENU_REASSIGN_2NDRY: 'menu:reassign-2ndry',
  MENU_MORPH_ANIM:    'menu:morph-anim',
  MENU_MOL_SURF:      'menu:mol-surf',
  MENU_SURF_CUTTER:   'menu:surf-cutter',
  MENU_APBS:          'menu:apbs',
  MENU_EXEC_SCRIPT:   'menu:exec-script',
  MENU_PERF_MEAS:     'menu:perf-meas',
  MENU_TOGGLE_TOPBAR: 'menu:toggle-topbar',
  MENU_CLEAR_LOG:     'menu:clear-log',
  MENU_RESTORE_PANELS: 'menu:restore-panels',
  MENU_ABOUT_PLUGINS: 'menu:about-plugins',
  MENU_ABOUT_CONFIG:  'menu:about-config',
  MENU_ADDON_MGR:     'menu:addon-mgr',
  MENU_CONSOLE:       'menu:console',
  MENU_CHECK_UPDATES: 'menu:check-updates',

  // invoke channels (renderer -> main, with reply) -- menu role actions
  MENU_INVOKE_ROLE: 'menu:invoke-role',

  // Window close / app quit lifecycle (red-button and Cmd+Q both funnel
  // through win.on('close'))
  WINDOW_CLOSE_REQUEST: 'window:close-request',
  WINDOW_CLOSE_PROCEED: 'window:close-proceed',

  // Renderer/Worker crash reporting + fallback UI's Quit button
  CRASH_REPORT: 'app:crash-report',
  FORCE_QUIT:   'app:force-quit',

  // --- Rendering window (modeless child) relay ---
  // The render window has no CueMol worker; commands and state are relayed
  // between it and the main window through the main process.
  RENDER_WINDOW_OPEN:       'render-window:open',              // invoke: any renderer -> main
  RENDER_WINDOW_COMMAND:    'render-window:command',           // invoke: render window -> main
  RENDER_WINDOW_EXEC:       'render-window:exec',              // push:   main -> main window
  RENDER_WINDOW_STATE:      'render-window:state',             // invoke: main window -> main
  RENDER_WINDOW_STATE_PUSH: 'render-window:state-push',        // push:   main -> render window
  RENDER_VIEW_SIZE_GET:     'render-window:view-size-get',     // invoke: render window -> main
  RENDER_VIEW_SIZE_REQUEST: 'render-window:view-size-request', // push:   main -> main window
  RENDER_VIEW_SIZE_REPLY:   'render-window:view-size-reply',   // invoke: main window -> main

  // invoke channel for native viewport context menu
  NAVI_CTX_SHOW: 'navi-ctx:show',

  // invoke channel for native scene-tree context menu (ScenePane right-click)
  SCENE_CTX_SHOW: 'scene-ctx:show',

  // gesture push channels (main -> renderer)
  ROTATE_GESTURE: 'gesture:rotate',

  // generic push channel for menu items without specific handlers (main -> renderer)
  MENU_GENERIC: 'menu:generic',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]
