/**
 * @file dialogs/fopen-opt-dlgs/types.ts
 * @description What the file open option dialog is built from.
 *
 * The defaults themselves live on the worker boundary
 * (`worker/shared/fileOpenDefaults.ts`), because a service that opens a file
 * without a dialog needs exactly the same ones; they are re-exported here so
 * dialog code keeps taking everything from one place. What stays is what only
 * the dialog means: the "(modified)" comparison, the mol-format fallback, and
 * the derived PSF path.
 */

// The option types themselves live on the worker boundary (nine services read
// them); re-exported here so dialog code can keep taking them from one place.
export type {
    FormatKind,
    PdbOptions,
    MtzOptions,
    MapTypeChoice,
    Ccp4MapOptions,
    MsmsOptions,
    NamdCoorOptions,
    AmberPrmtopOptions,
    RendererOptions,
    PresetTypeEntry,
    FormatOptions,
    FileOpenOptions,
} from '@renderer/worker/shared/fileOpenTypes';

import type {
    FormatKind,
    PdbOptions,
    MtzOptions,
    Ccp4MapOptions,
    MsmsOptions,
    NamdCoorOptions,
    AmberPrmtopOptions,
    FormatOptions,
} from '@renderer/worker/shared/fileOpenTypes';

// The defaults and the reader mapping: shared with the worker, re-exported so
// dialog code has one import site.
export {
    formatKindForReader,
    getDefaultPdbOptions,
    getDefaultMtzOptions,
    getDefaultCcp4MapOptions,
    getDefaultMsmsOptions,
    getDefaultNamdCoorOptions,
    getDefaultAmberPrmtopOptions,
    getDefaultRendererOptions,
    mapReaderDefaultsToFormatOptions,
    buildDefaultFormatOptions,
} from '@renderer/worker/shared/fileOpenDefaults';


/**
 * Default PSF topology path for a NAMD coordinate file: the coordinate path
 * with its final extension replaced by `.psf`. Mirrors UXP fopen-namdcooropt
 * (`util.splitFileName(path, "*.coor") + ".psf"`).
 */
export function deriveDefaultPsfPath(coorPath: string): string {
  if (!coorPath) return '';
  return coorPath.replace(/\.[^.\\/]+$/, '') + '.psf';
}

// Returns true for formats that produce MolCoord-like objects, where atom
// selection is meaningful. False for scalar/surface objects (mtz, ccp4map,
// msms).
//
// A weak fallback: it only knows the reader nickname, and the map readers it
// does not list (brix / mmcifmap / qdfmap / xplormap) come through as
// 'unknown' and count as molecules. Prefer `isMolObjectClass(objType)`
// (worker/shared/objectClasses) wherever the object's C++ class is known; this
// is what the dialog falls back to when it is not.
export function isMolFormat(kind: FormatKind): boolean {
  switch (kind) {
    case 'mtz':
    case 'ccp4map':
    case 'msms':
      return false;
    default:
      return true;
  }
}

/**
 * Returns true if `options` differs from the baseline `defaults` for that
 * format. Used to display a "(modified)" hint in the collapsible header.
 *
 * @param options - The current dialog state.
 * @param defaults - The baseline to compare against. For PDB/mmCIF/CCP4 this
 *   is the C++-sourced default seeded by FileOpenOptionDialog; for the other
 *   formats it is the static `getDefault*Options` baseline.
 */
export function isFormatOptionsModified(options: FormatOptions, defaults: FormatOptions): boolean {
  if (options.kind !== defaults.kind) return false;
  switch (options.kind) {
    case 'pdb':
    case 'mmcif': {
      const o = options.options;
      const d = defaults.options as PdbOptions;
      return (
        o.loadModel !== d.loadModel ||
        o.loadAnisou !== d.loadAnisou ||
        o.loadAltConf !== d.loadAltConf ||
        o.loadSegid !== d.loadSegid ||
        o.build2ndry !== d.build2ndry ||
        o.autoTopology !== d.autoTopology
      );
    }
    case 'mtz': {
      const o = options.options;
      const d = defaults.options as MtzOptions;
      return (
        o.columnF !== d.columnF ||
        o.columnPhi !== d.columnPhi ||
        o.phaseEnabled !== d.phaseEnabled ||
        o.columnW !== d.columnW ||
        o.weightEnabled !== d.weightEnabled ||
        o.gridSpacing !== d.gridSpacing
      );
    }
    case 'ccp4map': {
      const o = options.options;
      const d = defaults.options as Ccp4MapOptions;
      return (
        o.normalize !== d.normalize ||
        o.truncateMinEnabled !== d.truncateMinEnabled ||
        o.truncateMin !== d.truncateMin ||
        o.truncateMaxEnabled !== d.truncateMaxEnabled ||
        o.truncateMax !== d.truncateMax ||
        o.mapType !== d.mapType ||
        o.subsample !== d.subsample
      );
    }
    case 'msms':
      return options.options.vertFilePath !== (defaults.options as MsmsOptions).vertFilePath;
    case 'namdcoor':
      return options.options.psfFilePath !== (defaults.options as NamdCoorOptions).psfFilePath;
    case 'amberprm':
      return options.options.coordFilePath !== (defaults.options as AmberPrmtopOptions).coordFilePath;
    default:
      return false;
  }
}

