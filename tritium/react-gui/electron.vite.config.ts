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

const workerGlobals: Record<string, string> = {
  // Map the external to a require() call executed at IIFE init time.
  // Electron's nodeIntegrationInWorker injects the global require.
  '@cuemol/core': 'require("@cuemol/core")',
  fs: 'require("fs")',
  os: 'require("os")',
  path: 'require("path")',
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react(), tsconfigPaths()],
    build: {
      rollupOptions: {
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
