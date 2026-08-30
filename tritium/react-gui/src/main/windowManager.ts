/**
 * @file main/windowManager.ts
 * @description Window creation and lifecycle. The modules live in `windows/`;
 * this is the name the rest of main asks for them by.
 */

export { createWindow, focusMainWindow, getMainWindow } from './windows/mainWindow'
export { createOrFocusRenderWindow, getRenderWindow } from './windows/renderWindow'
