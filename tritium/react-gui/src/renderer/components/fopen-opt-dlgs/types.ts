/**
 * @file FileOpenOptionDialog/types.ts
 * @description Type definitions and default values for the file open option dialog.
 */

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

export interface Ccp4MapOptions {
  normalize: boolean;
  truncateMinEnabled: boolean;
  truncateMin: number;
  truncateMaxEnabled: boolean;
  truncateMax: number;
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
  return {
    loadModel: true,
    loadAnisou: false,
    loadAltConf: false,
    loadSegid: false,
    build2ndry: true,
    autoTopology: false,
  };
}

export function getDefaultMtzOptions(): MtzOptions {
  // Placeholders; the real defaults (column selections + resolution) are
  // filled in by FileOpenOptionDialog once the worker reads the MTZ header.
  // Grid spacing defaults to the UXP "Fine" preset (0.25).
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
  // Truncation disabled by default, matching the CCP4MapReader defaults
  // (truncate_min / truncate_max false). The sigma values are retained as
  // editable defaults so enabling a toggle uses a sensible clamp.
  return {
    normalize: true,
    truncateMinEnabled: false,
    truncateMin: -5.0,
    truncateMaxEnabled: false,
    truncateMax: 5.0,
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
// msms) — see NON_MOL_CLASSES in setupRenderer.service.ts.
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
 * Returns true if the given FormatOptions differ from the defaults for that format.
 * Used to display a "(modified)" hint in the collapsible header.
 */
export function isFormatOptionsModified(options: FormatOptions): boolean {
  switch (options.kind) {
    case 'pdb':
    case 'mmcif': {
      const d = getDefaultPdbOptions();
      const o = options.options;
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
      const d = getDefaultMtzOptions();
      const o = options.options;
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
      const d = getDefaultCcp4MapOptions();
      const o = options.options;
      return (
        o.normalize !== d.normalize ||
        o.truncateMinEnabled !== d.truncateMinEnabled ||
        o.truncateMin !== d.truncateMin ||
        o.truncateMaxEnabled !== d.truncateMaxEnabled ||
        o.truncateMax !== d.truncateMax
      );
    }
    case 'msms':
      return options.options.vertFilePath !== '';
    case 'namdcoor':
      return options.options.psfFilePath !== '';
    case 'amberprm':
      return options.options.coordFilePath !== '';
    default:
      return false;
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
