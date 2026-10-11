/**
 * Bundle tritium_cli (src/tritium_cli.ts) into one ES module,
 * dist/tritium_cli.mjs, the file react-gui's electron-builder ships as
 * <resources>/cli/tritium_cli.mjs (see react-gui/build/cliWrapper.js).
 *
 * One file because the shipped command runs it in the app's executable as
 * Node with no node_modules beside it: whatever it imports (@cuemol/console-kit,
 * npm packages) has to be inside. Node 18 is the floor for running it from the
 * repo with a plain `node`; the app's own Node is newer.
 */

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(root, 'src/tritium_cli.ts')],
  outfile: path.join(root, 'dist/tritium_cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // The entry's own shebang is kept by esbuild.
  logLevel: 'warning',
})
