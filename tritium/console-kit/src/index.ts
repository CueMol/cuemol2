/**
 * @file index.ts
 * @description @cuemol/console-kit: what the console panel (react-gui) and
 * tritium_cli (cli) share.
 *
 * Shipped as TypeScript source, never built on its own: every consumer
 * bundles it (electron-vite for the app, esbuild for the command line). It
 * must stay free of DOM and Node APIs (tsconfig.json has neither), because it
 * runs in the renderer, the worker, main and the command line.
 */

export * from './localApi'
export * from './quit'
