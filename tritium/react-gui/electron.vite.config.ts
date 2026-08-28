import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// ---------------------------------------------------------------------------
// Native addon resolution for Web Workers
// ---------------------------------------------------------------------------
// The @cuemol/core package contains a C++ native addon (cuemol_internal.node)
// loaded via the `bindings` npm package.  `bindings` locates the .node file
// relative to the *calling module's* __dirname, which only works when the
// call originates from inside the core/ directory (core/src/index.cjs).
//
// The Vite worker build bundles source into an IIFE that runs inside an
// Electron Web Worker (nodeIntegrationInWorker: true).  To ensure correct
// path resolution we:
//
//   1. Externalize '@cuemol/core' from the worker bundle so it is NOT inlined.
//   2. Map it to require("@cuemol/core") via output.globals — the IIFE
//      receives the result as a parameter.
//   3. At runtime, Electron's global require loads the CJS entry point
//      (core/src/index.cjs, specified via the "require" export condition in
//      core/package.json), which calls bindings() with the correct __dirname.
//
// This is the Vite/Rollup equivalent of Webpack's
//   { externals: ['@cuemol/core'], output: { libraryTarget: 'commonjs2' } }
// ---------------------------------------------------------------------------

const workerExternal = [
  // --- native addon (see comment block above) ---
  '@cuemol/core',

  // --- Node.js built-ins not needed in the bundle ---
  'worker_threads',
  'pino-pretty',
  'url',
  'module',
  'node:module',
  'node:path',
  'node:url',

  // --- Node.js built-ins used at runtime by the render pipeline ---
  // (the worker runs with nodeIntegrationInWorker: true)
  'fs',
  'os',
  'path',
]

// ---------------------------------------------------------------------------
// Developer-only UI flag (__DEV_UI__)
// ---------------------------------------------------------------------------
// Some sidebar UI exists only for development / design review -- currently the
// "Component Catalog" activity-bar view (CatalogPane1-3). It is gated on the
// compile-time constant __DEV_UI__ so that a release build drops the branches
// and, by tree-shaking, the CatalogPane modules themselves.
//
// Release packaging (packaging/package.sh, and the package:dir script) sets
// CUEMOL_RELEASE=1 before running electron-vite build. A plain
// `electron-vite build` / `electron-vite dev` -- i.e. every developer run,
// including `electron-vite preview` of that build -- keeps the dev UI. Note
// that import.meta.env.DEV cannot be used for this: `preview` runs a
// production bundle, so DEV is already false in a normal debug run.
const devUi = process.env.CUEMOL_RELEASE !== '1'

const workerGlobals: Record<string, string> = {
  // Map the external to a require() call executed at IIFE init time.
  // Electron's nodeIntegrationInWorker injects the global require.
  '@cuemol/core': 'require("@cuemol/core")',
  fs: 'require("fs")',
  os: 'require("os")',
  path: 'require("path")',
}

// ---------------------------------------------------------------------------
// Path aliases
// ---------------------------------------------------------------------------
// Mirrors `paths` in tsconfig.web.json / tsconfig.node.json. Declared as an
// explicit `resolve.alias` (rather than relying on vite-tsconfig-paths alone)
// because Vite does NOT apply plugins to the worker bundle, while `resolve` IS
// inherited by it -- the Web Worker sources under src/renderer/worker/server
// must be able to use the same aliases as the UI code.
//
// The renderer prefix is `@renderer`, not `@`: the sibling workspace package
// @cuemol/core maps `@/*` onto its OWN src/ (core/tsconfig.json), and we deep
// import core TypeScript sources (e.g. '@cuemol/core/src/cuemol' from
// WorkerService.ts), so core modules are compiled inside our bundle. A bare `@`
// alias here would capture core's internal `@/...` specifiers and resolve them
// into src/renderer/. Today core only uses `@/` in type positions (erased
// before bundling), so nothing breaks -- but the collision would appear
// silently the day core adds a value import.
const rendererAlias = {
  '@renderer': resolve(__dirname, 'src/renderer'),
  '@shared': resolve(__dirname, 'src/shared'),
}

const mainAlias = {
  '@main': resolve(__dirname, 'src/main'),
  '@shared': resolve(__dirname, 'src/shared'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: mainAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: mainAlias },
  },
  renderer: {
    plugins: [react(), tsconfigPaths()],
    resolve: { alias: rendererAlias },
    define: {
      __DEV_UI__: JSON.stringify(devUi),
    },
    build: {
      rollupOptions: {
        // Two HTML entries: the main window (index.html) and the modeless
        // Rendering window (render.html). Listing an explicit input map
        // replaces electron-vite's single-page default.
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          render: resolve(__dirname, 'src/renderer/render.html'),
        },
        external: [
          'worker_threads',
          'bindings',
          'pino-pretty',
          'url',
          'module',
          'node:module',
          'node:path',
          'node:url',
        ],
      },
    },
    worker: {
      format: 'iife',
      rollupOptions: {
        external: workerExternal,
        output: {
          globals: workerGlobals,
        },
      },
    },
  },
})
