/**
 * @file shared/appInfo.ts
 * @description Single source of truth for the user-facing application name.
 *
 * Imported by the main process (app.setName, native menu) and the renderer
 * (About dialog, React menu) so the name shown in Finder, the menu bar, and
 * the About box stays consistent. The bundle identifier (appId) and the
 * packaged bundle name are set by electron-builder (electron-builder.yml:
 * appId / productName); keep that productName equal to APP_PRODUCT_NAME.
 */

/** User-facing product name (matches electron-builder.yml productName). */
export const APP_PRODUCT_NAME = 'CueMol3'

/**
 * Application id (matches electron-builder.yml appId; `appInfo.test.ts` pins
 * the two together). electron-builder stamps it on the NSIS shortcut as the
 * Windows Application User Model ID, and main sets the same id on the running
 * process so the shortcut, the main window and the Rendering window all group
 * under one taskbar button.
 */
export const APP_ID = 'org.cuemol.cuemol3'
