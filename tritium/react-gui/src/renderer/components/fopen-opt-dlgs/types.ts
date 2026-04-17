/**
 * @file FileOpenOptionDialog/types.ts
 * @description Type definitions and default values for the file open option dialog.
 */

// ---- Format kind ----

export type FormatKind = 'pdb' | 'mmcif' | 'mtz' | 'ccp4map' | 'msms' | 'namdcoor' | 'unknown';

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
  columnW: string;
  resolutionLimit: number;
  gridSpacing: number;
}

export interface Ccp4MapOptions {
  normalize: boolean;
  truncateMin: number;
  truncateMax: number;
}

export interface MsmsOptions {
  vertFilePath: string;
}

export interface NamdCoorOptions {
  psfFilePath: string;
}

export interface RendererOptions {
  objectName: string;
  rendererType: string;
  rendererName: string;
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
  | { kind: 'unknown'; options: Record<string, never> };

export interface FileOpenOptions {
  format: FormatOptions;
  renderer: RendererOptions;
}

// ---- Format detection ----

export function detectFormatKind(filePath: string): FormatKind {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdb':
    case 'ent':
      return 'pdb';
    case 'cif':
    case 'mmcif':
      return 'mmcif';
    case 'mtz':
      return 'mtz';
    case 'ccp4':
    case 'map':
    case 'mrc':
      return 'ccp4map';
    case 'face':
      return 'msms';
    case 'crd':
    case 'namdbin':
      return 'namdcoor';
    default:
      return 'unknown';
  }
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
  return {
    columnF: '',
    columnPhi: '',
    columnW: '',
    resolutionLimit: 0,
    gridSpacing: 0.33,
  };
}

export function getDefaultCcp4MapOptions(): Ccp4MapOptions {
  return {
    normalize: true,
    truncateMin: -5.0,
    truncateMax: 5.0,
  };
}

export function getDefaultMsmsOptions(): MsmsOptions {
  return { vertFilePath: '' };
}

export function getDefaultNamdCoorOptions(): NamdCoorOptions {
  return { psfFilePath: '' };
}

export function getDefaultRendererOptions(filePath: string): RendererOptions {
  const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'molecule';
  return {
    objectName: fileName,
    rendererType: 'simple',
    rendererName: 'simple1',
    selection: '*',
    centerView: true,
  };
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
        o.columnW !== d.columnW ||
        o.resolutionLimit !== d.resolutionLimit ||
        o.gridSpacing !== d.gridSpacing
      );
    }
    case 'ccp4map': {
      const d = getDefaultCcp4MapOptions();
      const o = options.options;
      return (
        o.normalize !== d.normalize ||
        o.truncateMin !== d.truncateMin ||
        o.truncateMax !== d.truncateMax
      );
    }
    case 'msms':
      return options.options.vertFilePath !== '';
    case 'namdcoor':
      return options.options.psfFilePath !== '';
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
    default:
      return { kind: 'unknown', options: {} };
  }
}
