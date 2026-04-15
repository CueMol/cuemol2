/**
 * Application menu setup for the Electron main process.
 */

import { app, Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipcChannels'

const isMac = process.platform === 'darwin'

export function createMenu(mainWindow: BrowserWindow): void {
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
          click: () => mainWindow.webContents.send(IPC.MENU_OPEN_FILE),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send(IPC.MENU_SAVE),
        },
        { type: 'separator' },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.webContents.send(IPC.MENU_NEW_TAB),
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow.webContents.send(IPC.MENU_CLOSE_TAB),
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
          click: () => mainWindow.webContents.send(IPC.MENU_NEW_SCENE),
        },
        {
          label: 'Open File...',
          click: () => mainWindow.webContents.send(IPC.MENU_OPEN_FILE),
        },
        {
          label: 'Open Scene...',
          click: () => mainWindow.webContents.send(IPC.MENU_OPEN_SCENE),
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
