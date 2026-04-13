import { app, BrowserWindow, Menu, screen } from 'electron'
import { join } from 'path'
import { loadWindowBounds, saveWindowBounds, type WindowBounds } from './stateStore'
import { registerIpcHandlers, handleOpenFile } from './ipcHandlers'
import { IPC } from '../shared/ipcChannels'

const isMac = process.platform === 'darwin'

let mainWindow: BrowserWindow | null = null

// ─────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────

function isVisibleOnAnyDisplay(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const { x, y, width, height } = d.workArea
    return (
      bounds.x + bounds.width > x + 100 &&
      bounds.x < x + width - 100 &&
      bounds.y + bounds.height > y + 100 &&
      bounds.y < y + height - 100
    )
  })
}

function trackWindowState(win: BrowserWindow): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const persist = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!win.isDestroyed()) {
        const isMaximized = win.isMaximized()
        const bounds = isMaximized ? (loadWindowBounds() ?? win.getBounds()) : win.getBounds()
        saveWindowBounds({ ...bounds, isMaximized })
      }
    }, 300)
  }

  win.on('resize', persist)
  win.on('move', persist)
  win.on('maximize', persist)
  win.on('unmaximize', persist)
  win.on('close', persist)
}

const createWindow = (): void => {
  const saved = loadWindowBounds()
  const boundsOnScreen = saved ? isVisibleOnAnyDisplay(saved) : false

  mainWindow = new BrowserWindow({
    width: boundsOnScreen ? saved!.width : 1400,
    height: boundsOnScreen ? saved!.height : 900,
    ...(boundsOnScreen ? { x: saved!.x, y: saved!.y } : {}),
    minWidth: 800,
    minHeight: 600,
    title: 'CueMol',
    backgroundColor: '#1e2028',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: true,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  if (saved?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Forward renderer/worker console messages to stdout/stderr
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const src = sourceId ? ` (${sourceId}:${line})` : ''
    if (level === 3) {
      console.error('[Renderer]', message + src)
    } else if (level === 2) {
      console.warn('[Renderer]', message + src)
    } else {
      console.log('[Renderer]', message + src)
    }
  })

  trackWindowState(mainWindow)
  registerIpcHandlers(mainWindow)
  createMenu()

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'undocked' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─────────────────────────────────────────────
// Menu
// ─────────────────────────────────────────────

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => { if (mainWindow) handleOpenFile(mainWindow) },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send(IPC.MENU_SAVE),
        },
        { type: 'separator' },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send(IPC.MENU_NEW_TAB),
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.webContents.send(IPC.MENU_CLOSE_TAB),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Scene',
      submenu: [
        {
          label: 'New Scene',
          click: () => mainWindow?.webContents.send(IPC.MENU_NEW_SCENE),
        },
        {
          label: 'Load Molecule...',
          click: () => { if (mainWindow) handleOpenFile(mainWindow) },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About CueMol',
          role: 'about',
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
