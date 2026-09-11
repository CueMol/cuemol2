/**
 * @file plugins/getpdb/index.ts
 * @description The Get PDB plugin: fetch a structure and its density maps
 * from RCSB or PDBe by accession code.
 *
 * A whole feature in one directory -- the dialog, its input history, the
 * server URL table and the download chain -- reaching the core only through
 * generic services (`streamLoadFromUrl`, `streamLoadDensityMap`, the
 * file-open option dialog). It contributes a File menu row and a toolbar
 * button, which is what makes it the exercise for the menu and toolbar lanes.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { getPdbManifest } from './manifest'
import { GetPdbRoot } from './renderer/GetPdbRoot'

export const getPdbPlugin = /* @__PURE__ */ definePlugin({
  manifest: getPdbManifest,
  Root: GetPdbRoot,
})
