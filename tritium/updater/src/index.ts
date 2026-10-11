/**
 * @file index.ts
 * @description @cuemol/updater: self-update for the unsigned CueMol3 app.
 *
 * Shipped as TypeScript source and bundled into the app's main process by
 * electron-vite, like @cuemol/console-kit. Unlike console-kit it uses Node
 * APIs, and it never imports Electron: the host passes in what it needs, so
 * the flow is tested here without an app.
 */

export * from './version'
export * from './release'
export * from './download'
export * from './controller'
export * from './handoff'
export * from './mac/swapScript'
export * from './mac/installerMac'
