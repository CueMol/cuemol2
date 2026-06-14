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
