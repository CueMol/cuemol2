/**
 * @file worker/shared/fileOpenDefaults.ts
 * @description The option values a file load starts from, and how a reader
 * maps onto them.
 *
 * Shared rather than owned by the File Open dialog because a load does not
 * always have a dialog in front of it: a worker service that opens a file on
 * its own has to build the same `FileOpenOptions`, and building a second,
 * nearly-identical set of defaults there is how the two drift apart.
 *
 * Reader-option defaults are NOT hardcoded here: they come from the C++
 * reader (qif `default` / constructor), read through the
 * `getReaderDefaultOptions` service and mapped by
 * `mapReaderDefaultsToFormatOptions`. The `getDefault*Options` functions
 * return transient placeholders only (overwritten before the user sees the
 * pane), mirroring the MTZ header-driven defaults. The lone exception is the
 * MTZ grid spacing, a deliberate UXP UI preset (see `getDefaultMtzOptions`).
 */

import type { ReaderDefaultOptions } from '@renderer/worker/server/services/file/getReaderDefaultOptions';
import type {
    FormatKind,
    PdbOptions,
    MtzOptions,
    Ccp4MapOptions,
    MsmsOptions,
    NamdCoorOptions,
    AmberPrmtopOptions,
    RendererOptions,
    FormatOptions,
} from '@renderer/worker/shared/fileOpenTypes';

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
    mapCenterPolicy: 'auto',
  };
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
