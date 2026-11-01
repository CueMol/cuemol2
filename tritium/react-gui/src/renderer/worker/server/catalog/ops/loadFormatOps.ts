/**
 * @file worker/server/catalog/ops/loadFormatOps.ts
 * @description One load op per file format, taking that format's reader
 * options as ordinary named arguments.
 *
 * `load_file` loads with the reader's defaults. To change an option, the
 * format's own op is used -- `load_pdb f.pdb, build2ndry=false` -- the way
 * the File Open option dialog has one pane per format. Each op's arguments
 * are fixed and typed, so `help` and an MCP client's schema list them, and
 * a null leaves the reader's default.
 *
 * Each op reads with its one reader and never sniffs: `load_ccp4 f.map`
 * reads f.map as CCP4 even when its content would sniff as something else,
 * and fails with that reader's error when it is not CCP4. That is also why
 * PDB and mmCIF have an op each.
 *
 * The names follow the option types of `fileOpenTypes.ts`.
 */

import type { FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { defineOp } from '../op'
import type { OpContext, OpOutcome } from '../op'
import type { LoadArgs } from '../fileLoad'
import { LOAD_RENDERER_PARAMS, NULL_RENDERER_DOC, loadObjectFile, readerTarget } from '../fileLoad'
import { callerPath } from '../outputFile'
import { boolean, enumOf, integer, optional, path, real, rendererType, selection, string } from '../params'

const EXPOSE = { tool: false, console: true, mcp: true } as const

/** The arguments every format's load op starts with; `readerName` reads the file. */
const common = (readerName: string) => ({
  path: path('The file to open.', readerName),
  rendererType: optional(rendererType(`Renderer to create for it. ${NULL_RENDERER_DOC}`)),
  selection: optional(selection('Draw only this selection. Null draws everything.')),
  name: optional(string('Name of the new object. Null uses the file name.')),
  ...LOAD_RENDERER_PARAMS,
})

/** A format's options with the given (non-null) values written over them. */
function withValues<T extends object>(options: T, values: Partial<Record<keyof T, unknown>>): T {
  const out = { ...options } as Record<string, unknown>
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) out[k] = v
  return out as T
}

/**
 * Load `args.path` with `readerName`, with `set` changing that reader's options.
 *
 * @param label - the format as an error names it ("a CCP4 / MRC map")
 */
function loadAs(
  ctx: WorkerContext,
  oc: OpContext,
  args: LoadArgs & { path: string },
  readerName: string,
  label: string,
  set: (format: FormatOptions) => FormatOptions,
): OpOutcome {
  const target = readerTarget(ctx, args.path, readerName)
  if (target.scene) return { ok: false, error: `${target.filePath} is a scene, not ${label}.` }
  return loadObjectFile(ctx, oc, target, args, set)
}

/** The structure reader options PDB and mmCIF share. */
const STRUCTURE_OPTIONS = {
  loadModel: optional(boolean('Read every model of a multi-model file (NMR), not only the first.')),
  loadAnisou: optional(boolean('Read the anisotropic B-factors (ANISOU).')),
  loadAltConf: optional(boolean('Read the alternative conformations.')),
}
const STRUCTURE_TOPOLOGY = {
  build2ndry: optional(boolean('Compute the secondary structure instead of reading it from the file.')),
  autoTopology: optional(boolean('Build the bonds of residues the topology does not know.')),
}

export const loadPdb = defineOp({
  name: 'load_pdb',
  description:
    'Open a PDB file with the reader options of the File Open dialog. Each option ' +
    'left null keeps the reader\'s default. load_file opens one with all the defaults.',
  params: {
    ...common('pdb'),
    ...STRUCTURE_OPTIONS,
    loadSegid: optional(boolean('Read the segment ids.')),
    ...STRUCTURE_TOPOLOGY,
  },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    const { loadModel, loadAnisou, loadAltConf, loadSegid, build2ndry, autoTopology } = args
    return loadAs(ctx, oc, args, 'pdb', 'a PDB file', (f) =>
      f.kind === 'pdb'
        ? { ...f, options: withValues(f.options, { loadModel, loadAnisou, loadAltConf, loadSegid, build2ndry, autoTopology }) }
        : f,
    )
  },
})

export const loadMmcif = defineOp({
  name: 'load_mmcif',
  description:
    'Open an mmCIF coordinate model with the reader options of the File Open dialog. Each ' +
    'option left null keeps the reader\'s default. Not for a structure-factor CIF: load_file ' +
    'or fetch_map reads that as a map.',
  params: {
    ...common('mmcif'),
    ...STRUCTURE_OPTIONS,
    ...STRUCTURE_TOPOLOGY,
  },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    const { loadModel, loadAnisou, loadAltConf, build2ndry, autoTopology } = args
    return loadAs(ctx, oc, args, 'mmcif', 'an mmCIF file', (f) =>
      f.kind === 'mmcif'
        ? { ...f, options: withValues(f.options, { loadModel, loadAnisou, loadAltConf, build2ndry, autoTopology }) }
        : f,
    )
  },
})

export const loadMtz = defineOp({
  name: 'load_mtz',
  description:
    'Open an MTZ file as a density map, choosing its columns and grid. Giving columnPhi or ' +
    'columnWeight also uses that column. Each option left null keeps the reader\'s default.',
  params: {
    ...common('mtzmap'),
    columnF: optional(string('The amplitude column, e.g. FWT or 2FOFCWT.')),
    columnPhi: optional(string('The phase column, e.g. PHWT. Giving it uses phases.')),
    columnWeight: optional(string('The weight column, e.g. FOM. Giving it uses weights.')),
    resolutionLimit: optional(real('High resolution limit, in angstroms.')),
    gridSpacing: optional(real('Grid spacing, in angstroms.')),
  },
  mutates: true,
  expose: EXPOSE,
  group: 'maps',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, 'mtzmap', 'an MTZ file', (f) =>
      f.kind === 'mtz'
        ? {
            ...f,
            options: withValues(f.options, {
              columnF: args.columnF,
              columnPhi: args.columnPhi,
              phaseEnabled: args.columnPhi === null ? null : args.columnPhi !== '',
              columnW: args.columnWeight,
              weightEnabled: args.columnWeight === null ? null : args.columnWeight !== '',
              resolutionLimit: args.resolutionLimit,
              gridSpacing: args.gridSpacing,
            }),
          }
        : f,
    )
  },
})

export const loadCcp4 = defineOp({
  name: 'load_ccp4',
  description:
    'Open a CCP4 / MRC density map, with how its values are scaled and cut. Giving truncateMin ' +
    'or truncateMax also turns that truncation on. Each option left null keeps the reader\'s default.',
  params: {
    ...common('ccp4map'),
    normalize: optional(boolean('Normalise the values (in sigma).')),
    truncateMin: optional(real('Cut the values below this.')),
    truncateMax: optional(real('Cut the values above this.')),
    mapType: optional(enumOf(['auto', 'xtal', 'em'], 'What kind of map: auto (from the header), xtal (crystallographic) or em.')),
    subsample: optional(integer('Keep every n-th grid point on each axis.')),
  },
  mutates: true,
  expose: EXPOSE,
  group: 'maps',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, 'ccp4map', 'a CCP4 / MRC map', (f) =>
      f.kind === 'ccp4map'
        ? {
            ...f,
            options: withValues(f.options, {
              normalize: args.normalize,
              truncateMin: args.truncateMin,
              truncateMinEnabled: args.truncateMin === null ? null : true,
              truncateMax: args.truncateMax,
              truncateMaxEnabled: args.truncateMax === null ? null : true,
              mapType: args.mapType,
              subsample: args.subsample,
            }),
          }
        : f,
    )
  },
})

export const loadMsms = defineOp({
  name: 'load_msms',
  description: 'Open an MSMS surface: its .face file, and the .vert file beside it.',
  params: { ...common('msms'), vertFile: optional(path('The .vert file. Null takes the one beside the .face file.')) },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, 'msms', 'an MSMS surface', (f) =>
      f.kind === 'msms' && args.vertFile !== null ? { ...f, options: { ...f.options, vertFilePath: callerPath(args.vertFile) } } : f,
    )
  },
})

export const loadNamd = defineOp({
  name: 'load_namd',
  description: 'Open NAMD coordinates (.coor) with the structure (.psf) that names their atoms.',
  params: { ...common('namdcoor'), psfFile: path('The .psf file.') },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, 'namdcoor', 'a NAMD coordinate file', (f) =>
      f.kind === 'namdcoor' ? { ...f, options: { ...f.options, psfFilePath: callerPath(args.psfFile) } } : f,
    )
  },
})

export const loadAmber = defineOp({
  name: 'load_amber',
  description: 'Open an AMBER topology (prmtop), with a coordinate file (inpcrd / rst7) for its atoms.',
  params: { ...common('amberprm'), coordFile: optional(path('The coordinate file. Null puts every atom at the origin.')) },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, 'amberprm', 'an AMBER prmtop file', (f) =>
      f.kind === 'amberprm' && args.coordFile !== null ? { ...f, options: { ...f.options, coordFilePath: callerPath(args.coordFile) } } : f,
    )
  },
})

export const LOAD_FORMAT_OPS = [loadPdb, loadMmcif, loadMtz, loadCcp4, loadMsms, loadNamd, loadAmber]
