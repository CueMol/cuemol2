/**
 * @file worker/server/catalog/ops/loadFormatOps.ts
 * @description One load op per file format, taking that format's reader
 * options as ordinary named arguments.
 *
 * `load_file` loads with the reader's defaults. To change an option, the
 * format's own op is used -- `load_pdb f.pdb, build2ndry=false` -- the way
 * the File Open option dialog has one pane per format. Each op's arguments
 * are fixed and typed, so `help` and an MCP client's schema list them, and
 * a null leaves the reader's default. The reader is picked as for
 * `load_file`; a file that does not read as the op's format is refused.
 *
 * The names follow the option types of `fileOpenTypes.ts`.
 */

import type { FormatKind, FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { defineOp } from '../op'
import type { OpContext, OpOutcome } from '../op'
import type { LoadArgs } from '../fileLoad'
import { formatOf, loadObjectFile, openTarget } from '../fileLoad'
import { callerPath } from '../outputFile'
import { boolean, enumOf, integer, optional, path, real, rendererType, selection, string } from '../params'

const EXPOSE = { tool: false, console: true, mcp: true } as const

/** The arguments every format's load op starts with. */
const COMMON = {
  path: path('The file to open.'),
  rendererType: optional(rendererType("Renderer to create for it. Null uses the reader's default.")),
  selection: optional(selection('Draw only this selection. Null draws everything.')),
  name: optional(string('Name of the new object. Null uses the file name.')),
}

/** A format's options with the given (non-null) values written over them. */
function withValues<T extends object>(options: T, values: Partial<Record<keyof T, unknown>>): T {
  const out = { ...options } as Record<string, unknown>
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) out[k] = v
  return out as T
}

/**
 * Load `args.path` as one of `kinds`, with `set` changing that format's options.
 *
 * @param label - the format as an error names it ("an MTZ file")
 */
function loadAs(
  ctx: WorkerContext,
  oc: OpContext,
  args: LoadArgs & { path: string },
  kinds: readonly FormatKind[],
  label: string,
  set: (format: FormatOptions) => FormatOptions,
): OpOutcome {
  const target = openTarget(ctx, args.path)
  if ('error' in target) return { ok: false, error: target.error }
  if (target.scene || !kinds.includes(formatOf(target.readerName))) {
    const as = target.scene ? 'a scene' : target.readerName
    return { ok: false, error: `${target.filePath} is not ${label} (it reads as ${as}).` }
  }
  return loadObjectFile(ctx, oc, target, args, set)
}

export const loadPdb = defineOp({
  name: 'load_pdb',
  description:
    'Open a PDB or mmCIF file with the reader options of the File Open dialog. Each option ' +
    'left null keeps the reader\'s default. load_file opens one with all the defaults.',
  params: {
    ...COMMON,
    loadModel: optional(boolean('Read every model of a multi-model file (NMR), not only the first.')),
    loadAnisou: optional(boolean('Read the anisotropic B-factors (ANISOU).')),
    loadAltConf: optional(boolean('Read the alternative conformations.')),
    loadSegid: optional(boolean('Read the segment ids (PDB only).')),
    build2ndry: optional(boolean('Compute the secondary structure instead of reading it from the file.')),
    autoTopology: optional(boolean('Build the bonds of residues the topology does not know.')),
  },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    const { loadModel, loadAnisou, loadAltConf, loadSegid, build2ndry, autoTopology } = args
    return loadAs(ctx, oc, args, ['pdb', 'mmcif'], 'a PDB or mmCIF file', (f) =>
      f.kind === 'pdb' || f.kind === 'mmcif'
        ? { ...f, options: withValues(f.options, { loadModel, loadAnisou, loadAltConf, loadSegid, build2ndry, autoTopology }) }
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
    ...COMMON,
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
    return loadAs(ctx, oc, args, ['mtz'], 'an MTZ file', (f) =>
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
    ...COMMON,
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
    return loadAs(ctx, oc, args, ['ccp4map'], 'a CCP4 / MRC map', (f) =>
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
  params: { ...COMMON, vertFile: optional(path('The .vert file. Null takes the one beside the .face file.')) },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, ['msms'], 'an MSMS surface', (f) =>
      f.kind === 'msms' && args.vertFile !== null ? { ...f, options: { ...f.options, vertFilePath: callerPath(args.vertFile) } } : f,
    )
  },
})

export const loadNamd = defineOp({
  name: 'load_namd',
  description: 'Open NAMD coordinates (.coor) with the structure (.psf) that names their atoms.',
  params: { ...COMMON, psfFile: path('The .psf file.') },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, ['namdcoor'], 'a NAMD coordinate file', (f) =>
      f.kind === 'namdcoor' ? { ...f, options: { ...f.options, psfFilePath: callerPath(args.psfFile) } } : f,
    )
  },
})

export const loadAmber = defineOp({
  name: 'load_amber',
  description: 'Open an AMBER topology (prmtop), with a coordinate file (inpcrd / rst7) for its atoms.',
  params: { ...COMMON, coordFile: optional(path('The coordinate file. Null puts every atom at the origin.')) },
  mutates: true,
  expose: EXPOSE,
  group: 'files',
  run(ctx, args, oc) {
    return loadAs(ctx, oc, args, ['amberprm'], 'an AMBER prmtop file', (f) =>
      f.kind === 'amberprm' && args.coordFile !== null ? { ...f, options: { ...f.options, coordFilePath: callerPath(args.coordFile) } } : f,
    )
  },
})

export const LOAD_FORMAT_OPS = [loadPdb, loadMtz, loadCcp4, loadMsms, loadNamd, loadAmber]
