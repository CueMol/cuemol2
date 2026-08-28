/**
 * @file components/fopen-opt-dlgs/types.ts
 * @description Type definitions and default values for the file open option dialog.
 *
 * Reader-option defaults are NOT hardcoded here: they come from the C++ reader
 * (qif `default` / constructor), fetched at dialog-open via the
 * `getReaderDefaultOptions` worker service and mapped by
 * `mapReaderDefaultsToFormatOptions`. The `getDefault*Options` functions below
 * return transient placeholders only (overwritten before the user sees the
 * pane), mirroring the MTZ header-driven defaults. The lone exception is the
 * MTZ grid spacing, a deliberate UXP UI preset (see `getDefaultMtzOptions`).
 */
import type { ReaderDefaultOptions } from '../../worker/server/services/getReaderDefaultOptions.service';

// ---- Format kind ----

export type FormatKind = 'pdb' | 'mmcif' | 'mtz' | 'ccp4map' | 'msms' | 'namdcoor' | 'amberprm' | 'unknown';

// ---- Per-format option types ----

export interface PdbOptions {
  loadModel: boolean;
  loadAnisou: boolean;
  loadAltConf: boolean;
  loadSegid: boolean;
  build2ndry: boolean;
  autoTopology: boolean;
}

export interface MtzOptions {
  columnF: string;
  columnPhi: string;
  /** Whether the phase column is used (UXP "Phase" checkbox). */
  phaseEnabled: boolean;
  columnW: string;
  /** Whether the weight column is used (UXP "Weight" checkbox). */
  weightEnabled: boolean;
  resolutionLimit: number;
  gridSpacing: number;
}

/** DensityMap `map_type` values offered by the CCP4/MRC option pane. */
export type MapTypeChoice = 'auto' | 'xtal' | 'em';

export interface Ccp4MapOptions {
  normalize: boolean;
  truncateMinEnabled: boolean;
  truncateMin: number;
  truncateMaxEnabled: boolean;
  truncateMax: number;
  /**
   * Map kind override applied to the loaded DensityMap (`map_type`), not a
   * reader property: 'auto' keeps the header-based detection.
   */
  mapType: MapTypeChoice;
  /** CCP4MapReader `subsample`: keep every n-th grid point on each axis. */
  subsample: number;
}

export interface MsmsOptions {
  vertFilePath: string;
}

export interface NamdCoorOptions {
  psfFilePath: string;
}

export interface AmberPrmtopOptions {
  /**
   * Optional AMBER coordinate file (inpcrd / rst7 / restrt) attached as the
   * reader's "coord" sub-stream. Empty -> topology-only load (atoms at zero).
   */
  coordFilePath: string;
}

export interface RendererOptions {
  objectName: string;
  rendererType: string;
  rendererName: string;
  selectionEnabled: boolean;
  selection: string;
  centerView: boolean;
  /**
   * Set when the user picked a renderer preset (a `<objtype>-rendpreset`
   * style name, e.g. 'Default1RendPreset'). When set, the worker creates a
   * renderer group + child renderers via `Object.createPresetRenderer` and
   * `rendererType` is ignored; `rendererName` becomes both the group name
   * and the child-name prefix. Undefined -> plain single-renderer create.
   */
  presetName?: string;
}

/** One preset entry offered in the renderer-type dropdown. */
export interface PresetTypeEntry {
  /** Style id, e.g. 'Default1RendPreset' (the value passed to the worker). */
  name: string;
  /** Human label from the style's desc attribute ('' when undefined). */
  desc: string;
}

// Discriminated union for format-specific options
export type FormatOptions =
  | { kind: 'pdb'; options: PdbOptions }
  | { kind: 'mmcif'; options: PdbOptions }
  | { kind: 'mtz'; options: MtzOptions }
  | { kind: 'ccp4map'; options: Ccp4MapOptions }
  | { kind: 'msms'; options: MsmsOptions }
  | { kind: 'namdcoor'; options: NamdCoorOptions }
  | { kind: 'amberprm'; options: AmberPrmtopOptions }
  | { kind: 'unknown'; options: Record<string, never> };

export interface FileOpenOptions {
  format: FormatOptions;
  renderer: RendererOptions;
}

// ---- Format detection ----

// Maps a cuemol/core reader nickname (the single source of truth for file
// type, resolved C++-side by StreamManager) to the dialog's option-pane kind.
// This mirrors UXP `selectShowTab(reader_name, "<nickname>")`: the pane is
// keyed on the resolved reader, never on an ad-hoc extension parse. Reader
// nicknames come from each ObjReader's getName() (PDBFileReader -> "pdb",
// MTZ2MapReader -> "mtzmap", etc.).
const READER_NICK_TO_KIND: Record<string, FormatKind> = {
  pdb: 'pdb',
  mmcif: 'mmcif',
  mtzmap: 'mtz',
  ccp4map: 'ccp4map',
  msms: 'msms',
  namdcoor: 'namdcoor',
  amberprm: 'amberprm',
};

/**
 * Resolve which format-specific option pane to show from the reader nickname
 * that cuemol/core picked for the file. Returns 'unknown' (no pane) for any
 * reader without dialog options.
 */
export function formatKindForReader(readerName: string): FormatKind {
  return READER_NICK_TO_KIND[readerName] ?? 'unknown';
}

// ---- Default values ----

export function getDefaultPdbOptions(): PdbOptions {
  // Placeholders only. The authoritative defaults come from the C++ reader
  // (PDBFileReader / MmcifMolReader qif), fetched by FileOpenOptionDialog via
  // `getReaderDefaultOptions` and applied through
  // `mapReaderDefaultsToFormatOptions`. Do NOT treat these as real defaults.
  return {
    loadModel: false,
    loadAnisou: false,
    loadAltConf: false,
    loadSegid: false,
    build2ndry: false,
    autoTopology: false,
  };
}

export function getDefaultMtzOptions(): MtzOptions {
  // Placeholders; the real defaults (column selections + resolution) are
  // filled in by FileOpenOptionDialog once the worker reads the MTZ header.
  // Grid spacing is the lone reader-option default kept on the TS side: UXP
  // itself hardcodes the "Fine (0.25)" UI preset (fopen-mtzopt-page.js
  // `selectMenuListByValue(mGridList, "0.25")`) rather than reading the
  // reader's gridsize (C++ default 0.333), so 0.25 is the UXP-faithful value.
  return {
    columnF: '',
    columnPhi: '',
    phaseEnabled: true,
    columnW: '',
    weightEnabled: false,
    resolutionLimit: 0,
    gridSpacing: 0.25,
  };
}

export function getDefaultCcp4MapOptions(): Ccp4MapOptions {
  // Placeholders only. The authoritative defaults come from the C++
  // CCP4MapReader (constructor: normalize=false, truncate_min/max=false,
  // min=0, max=5), fetched by FileOpenOptionDialog via
  // `getReaderDefaultOptions` and applied through
  // `mapReaderDefaultsToFormatOptions`. Do NOT treat these as real defaults.
  return {
    normalize: false,
    truncateMinEnabled: false,
    truncateMin: 0,
    truncateMaxEnabled: false,
    truncateMax: 0,
    mapType: 'auto',
    subsample: 1,
  };
}

export function getDefaultMsmsOptions(): MsmsOptions {
  return { vertFilePath: '' };
}

export function getDefaultNamdCoorOptions(): NamdCoorOptions {
  return { psfFilePath: '' };
}

export function getDefaultAmberPrmtopOptions(): AmberPrmtopOptions {
  // Coord sub-stream is optional; default empty (topology-only). The dialog
  // seeds the last-used coord path from history when available.
  return { coordFilePath: '' };
}

/**
 * Default PSF topology path for a NAMD coordinate file: the coordinate path
 * with its final extension replaced by `.psf`. Mirrors UXP fopen-namdcooropt
 * (`util.splitFileName(path, "*.coor") + ".psf"`).
 */
export function deriveDefaultPsfPath(coorPath: string): string {
  if (!coorPath) return '';
  return coorPath.replace(/\.[^.\\/]+$/, '') + '.psf';
}

export function getDefaultRendererOptions(filePath: string, defaultRendType?: string): RendererOptions {
  const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'molecule';
  const rendererType = defaultRendType ?? 'simple';
  // Initial placeholder values; scene-wide unique versions are filled in
  // asynchronously by FileOpenOptionDialog via the worker `proposeUniqName`
  // service (object name via tryBare+parens, renderer name scene-wide).
  return {
    objectName: fileName,
    rendererType,
    rendererName: rendererType + '1',
    selectionEnabled: false,
    selection: '*',
    centerView: true,
  };
}

// Returns true for formats that produce MolCoord-like objects, where atom
// selection is meaningful. False for scalar/surface objects (mtz, ccp4map,
// msms) -- see NON_MOL_CLASSES in setupRenderer.service.ts.
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

/**
 * Map the C++ reader's option-property values (from `getReaderDefaultOptions`)
 * onto the dialog's `FormatOptions`. The single place that translates reader
 * property names to dialog field names; used by FileOpenOptionDialog to seed
 * PDB / mmCIF / CCP4 defaults from the reader (UXP `fopen-*opt-page` onInit).
 *
 * @param kind - The dialog format kind to build options for.
 * @param v - Reader-backed values keyed by reader property name.
 * @returns FormatOptions for `kind`; falls back to the static placeholder for
 *   kinds without reader-backed value options.
 */
export function mapReaderDefaultsToFormatOptions(kind: FormatKind, v: ReaderDefaultOptions): FormatOptions {
  switch (kind) {
    case 'pdb':
      return {
        kind: 'pdb',
        options: {
          loadModel: !!v.loadmodel,
          loadAnisou: !!v.loadanisou,
          loadAltConf: !!v.loadaltconf,
          loadSegid: !!v.loadsegid,
          build2ndry: !!v.build2ndry,
          autoTopology: !!v.autoTopoGen,
        },
      };
    case 'mmcif':
      return {
        kind: 'mmcif',
        options: {
          loadModel: !!v.loadmodel,
          loadAnisou: !!v.loadanisou,
          loadAltConf: !!v.loadaltconf,
          // mmCIF reader has no loadsegid property; dialog field stays false.
          loadSegid: false,
          // mmCIF exposes loadsecstr (load 2ndry from file). The dialog's
          // build2ndry (recompute) is its inverse, matching applyReaderOptions
          // (loadsecstr = !build2ndry).
          build2ndry: !v.loadsecstr,
          autoTopology: !!v.autoTopoGen,
        },
      };
    case 'ccp4map':
      return {
        kind: 'ccp4map',
        options: {
          normalize: !!v.normalize,
          truncateMinEnabled: !!v.truncate_min,
          truncateMin: v.min ?? 0,
          truncateMaxEnabled: !!v.truncate_max,
          truncateMax: v.max ?? 0,
          mapType: 'auto',
          subsample: v.subsample ?? 1,
        },
      };
    default:
      return buildDefaultFormatOptions(kind);
  }
}

export function buildDefaultFormatOptions(kind: FormatKind): FormatOptions {
  switch (kind) {
    case 'pdb':
      return { kind: 'pdb', options: getDefaultPdbOptions() };
    case 'mmcif':
      return { kind: 'mmcif', options: getDefaultPdbOptions() };
    case 'mtz':
      return { kind: 'mtz', options: getDefaultMtzOptions() };
    case 'ccp4map':
      return { kind: 'ccp4map', options: getDefaultCcp4MapOptions() };
    case 'msms':
      return { kind: 'msms', options: getDefaultMsmsOptions() };
    case 'namdcoor':
      return { kind: 'namdcoor', options: getDefaultNamdCoorOptions() };
    case 'amberprm':
      return { kind: 'amberprm', options: getDefaultAmberPrmtopOptions() };
    default:
      return { kind: 'unknown', options: {} };
  }
}
