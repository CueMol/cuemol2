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
  SHELL_OPEN_PATH:    'shell:openPath',       // invoke: open a file with the OS default app
  SHELL_REVEAL_PATH:  'shell:revealPath',     // invoke: reveal a file in Finder / Explorer
  // Files the OS asked US to open (Finder double-click, argv, second-instance).
  // The payload always travels by pull -- see main/shellOpenQueue.ts.
  SHELL_FILES_TAKE:   'shell-files:take',     // invoke: drain + clear the queue
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
  // Wake-up ping for SHELL_FILES_TAKE. Carries no payload on purpose: a push
  // sent before the renderer subscribes is dropped, so the queue in main stays
  // the single source of truth and a reload re-pulls it.
  SHELL_FILES_PENDING: 'shell-files:pending',
  OBJ_FILE_OPENED:   'file:obj-opened',
  SCENE_FILE_OPENED: 'file:scene-opened',
  FILE_ERROR:        'file:error',
  MENU_SAVE:      'menu:save',
  MENU_SAVE_SCENE_AS: 'menu:save-scene-as',
  MENU_NEW_TAB:   'menu:new-tab',
  MENU_CLOSE_TAB: 'menu:close-tab',
  MENU_NEW_SCENE: 'menu:new-scene',
  MENU_OPEN_FILE:  'menu:open-file',
  MENU_OPEN_TRAJ:  'menu:open-traj',
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
  MENU_CLEAR_RECENT:  'menu:clear-recent',
  MENU_SAVE_FILE_AS:  'menu:save-file-as',
  MENU_SAVE_CURRENT_VIEW: 'menu:save-current-view',
  MENU_RELOAD_SCENE:  'menu:reload-scene',
  MENU_SELECT_ALL:    'menu:select-all',
  // Clipboard items are custom rather than Electron roles so the renderer can
  // route them by focus: a text field gets the native edit, a scene-tree or
  // paint-deck selection gets the node / row clipboard. See utils/editClipboard.
  MENU_EDIT_CUT:      'menu:edit-cut',
  MENU_EDIT_COPY:     'menu:edit-copy',
  MENU_EDIT_PASTE:    'menu:edit-paste',
  MENU_CLEAR_UNDO:    'menu:clear-undo',
  MENU_MERGE_MOL:     'menu:merge-mol',
  MENU_DELETE_MOL_ATOMS: 'menu:delete-mol-atoms',
  MENU_CHANGE_CHAIN_ID:  'menu:change-chain-id',
  MENU_CHANGE_RESID_NUM: 'menu:change-resid-num',
  MENU_OPTIONS:       'menu:options',
  MENU_IMAGE_RENDER:  'menu:image-render',
  MENU_MOVIE_RENDER:  'menu:movie-render',
  MENU_EXPORT_PNG:     'menu:export-png',
  MENU_EXPORT_UMBREON: 'menu:export-umbreon',
  MENU_EXPORT_POV:     'menu:export-pov',
  MENU_EXPORT_STL:     'menu:export-stl',
  MENU_EXPORT_MQO:     'menu:export-mqo',
  MENU_COLOR_PROOF:   'menu:color-proof',
  MENU_SCENE_PROPS:   'menu:scene-props',
  MENU_VIEW_PROPS:    'menu:view-props',
  MENU_MOL_SUPERPOSE: 'menu:mol-superpose',
  MENU_INTERACTION:   'menu:interaction',
  MENU_REASSIGN_2NDRY: 'menu:reassign-2ndry',
  MENU_MORPH_ANIM:    'menu:morph-anim',
  MENU_MOL_SURF:      'menu:mol-surf',
  MENU_SURF_CUTTER:   'menu:surf-cutter',
  MENU_APBS:          'menu:apbs',
  MENU_WINDOW_MAIN:   'menu:window-main',
  MENU_WINDOW_RENDER: 'menu:window-render',

  // invoke channels (renderer -> main, with reply) -- menu role actions
  MENU_INVOKE_ROLE: 'menu:invoke-role',

  // Window close / app quit lifecycle (red-button and Cmd+Q both funnel
  // through win.on('close'))
  WINDOW_CLOSE_REQUEST: 'window:close-request',
  WINDOW_CLOSE_PROCEED: 'window:close-proceed',
  WINDOW_CLOSE_PROGRESS: 'window:close-progress',

  // Window menu: raise the main window (the Rendering window has its own
  // open-or-focus channel, RENDER_WINDOW_OPEN).
  WINDOW_FOCUS_MAIN: 'window:focus-main',       // invoke: any renderer -> main

  // Main-window title: the renderer owns the active scene/view, so it pushes
  // the subtitle and main composes '<product> - <subtitle>'.
  WINDOW_SET_TITLE: 'window:set-title',        // invoke: renderer -> main

  // Renderer/Worker crash reporting + fallback UI's Quit button
  CRASH_REPORT: 'app:crash-report',
  FORCE_QUIT:   'app:force-quit',

  // --- Rendering window (modeless child) relay ---
  // The render window has no CueMol worker; commands and state are relayed
  // between it and the main window through the main process.
  RENDER_WINDOW_OPEN:       'render-window:open',              // invoke: any renderer -> main
  RENDER_WINDOW_MODE_PUSH:  'render-window:mode-push',         // push:   main -> render window
  RENDER_WINDOW_COMMAND:    'render-window:command',           // invoke: render window -> main
  RENDER_WINDOW_EXEC:       'render-window:exec',              // push:   main -> main window
  RENDER_WINDOW_STATE:      'render-window:state',             // invoke: main window -> main
  RENDER_WINDOW_STATE_PUSH: 'render-window:state-push',        // push:   main -> render window
  RENDER_VIEW_SIZE_GET:     'render-window:view-size-get',     // invoke: render window -> main
  RENDER_VIEW_SIZE_REQUEST: 'render-window:view-size-request', // push:   main -> main window
  RENDER_VIEW_SIZE_REPLY:   'render-window:view-size-reply',   // invoke: main window -> main
  RENDER_VIEW_CAMERA_GET:     'render-window:view-camera-get',     // invoke: render window -> main
  RENDER_VIEW_CAMERA_REQUEST: 'render-window:view-camera-request', // push:   main -> main window
  RENDER_VIEW_CAMERA_REPLY:   'render-window:view-camera-reply',   // invoke: main window -> main
  RENDER_HATCH_STYLE_GET:     'render-window:hatch-style-get',     // invoke: render window -> main
  RENDER_HATCH_STYLE_REQUEST: 'render-window:hatch-style-request', // push:   main -> main window
  RENDER_HATCH_STYLE_REPLY:   'render-window:hatch-style-reply',   // invoke: main window -> main
  RENDER_HISTORY_STORE:     'render-window:history-store',     // invoke: main window -> main
  RENDER_HISTORY_READ:      'render-window:history-read',      // invoke: render window -> main
  RENDER_IMAGE_SAVE:        'render-window:image-save',        // invoke: render window -> main
  RENDER_IMAGE_COPY:        'render-window:image-copy',        // invoke: render window -> main
  RENDER_HISTORY_CLEAR:     'render-window:history-clear',     // invoke: main window -> main
  RENDER_FRAME_READ:        'render-window:frame-read',        // invoke: render window -> main
  RENDER_FRAMES_CHECK:      'render-window:frames-check',      // invoke: render window -> main (count contiguous frames)
  RENDER_FRAMES_CLEANUP:    'render-window:frames-cleanup',    // invoke: render window -> main (delete frames + movie)
  RENDER_MOVIE_TEMPDIR:     'render-window:movie-tempdir',     // invoke: render window -> main (app-managed output folder)
  RENDER_MOVIE_SAVE:        'render-window:movie-save',        // invoke: render window -> main (copy the movie out)

  // invoke channel for native viewport context menu
  NAVI_CTX_SHOW: 'navi-ctx:show',

  // invoke channel for native scene-tree context menu (ScenePane right-click)
  SCENE_CTX_SHOW: 'scene-ctx:show',

  // CueMol scene / paint clipboard on the real OS clipboard. Main owns the
  // encoding so the payload can interoperate with the UXP CueMol2 app; the
  // renderer only relays bytes between the worker and these channels.
  CLIPBOARD_CUEMOL_WRITE: 'clipboard-cuemol:write', // invoke: renderer -> main
  CLIPBOARD_CUEMOL_READ:  'clipboard-cuemol:read',  // invoke: renderer -> main
  CLIPBOARD_CUEMOL_PEEK:  'clipboard-cuemol:peek',  // invoke: renderer -> main (gating only)

  // Text clipboard context menu on Windows/Linux: main pushes the right-click
  // params to the renderer (React menu), which invokes the chosen edit role
  // back on the main process. macOS keeps the native popup instead.
  TEXT_CTX_SHOW:   'text-ctx:show',   // push:   main -> renderer
  TEXT_CTX_ACTION: 'text-ctx:action', // invoke: renderer -> main

  // gesture push channels (main -> renderer)
  ROTATE_GESTURE: 'gesture:rotate',

  // generic push channel for menu items without specific handlers (main -> renderer)
  MENU_GENERIC: 'menu:generic',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]
