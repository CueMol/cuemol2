/**
 * @file worker/shared/fileOpenTypes.ts
 * @description What the File Open dialog decided, as the worker receives it.
 *
 * The dialog builds these and nine services read them, so they are a boundary
 * DTO rather than dialog internals -- `worker/server/` must not reach up into
 * `components/`. The dialog-side helpers that PRODUCE them (defaults, format
 * detection, reader mapping) stay in `dialogs/fopen-opt-dlgs/types.ts`,
 * which re-exports these for the UI code that has always taken them together.
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
