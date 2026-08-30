/**
 * @file components/panes/settings/settingsConfig.ts
 * @description Declarative catalogue for the SettingsPane: the category
 * tree, the setting definitions, and their default values.
 *
 * Every setting here is wired to a real backend (there are no mock entries):
 * - `display.darkMode` -> ThemeContext (electron-store)
 * - `atomLabel.*` -> StyleManager `DefaultLabel.*` via AppSettingsContext
 * - `rendering.povray*` / `blendpng` -> RenderConfigContext (electron-store)
 * - `input.device` -> ViewInputConfigContext (electron-store + C++)
 * - `mouse.xyRotSensitivity` / `mouse.pickPrecision` -> ViewInputConfig
 *   `tbrad` / `hitprec` via AppSettingsContext
 *
 * The atom-label and view-input values are user-defined STYLE values,
 * persisted to the user style file on window close (UXP parity), not to
 * electron-store.
 */

import type { AppIconKey } from '@renderer/h3-kit/primitives'
import type { RenderBinaries } from '@renderer/worker/shared/renderTypes'
import { DEFAULT_RENDER_BINARIES } from '@renderer/worker/shared/renderTypes'
import {
  PDB2PQR_FORCE_FIELDS,
  DEFAULT_PDB2PQR_FF,
  DEFAULT_APBS_BINARIES,
} from '@renderer/worker/shared/apbsTypes'
import type { ApbsConfigKey } from '@renderer/contexts/ApbsConfigContext'
import { INPUT_DEVICE_PREF_OPTIONS, INPUT_DEVICE_PREF_LABELS } from '@renderer/viewInputConfig'
import type { LabelDefaults } from '@renderer/worker/server/services/labelDefaults.service'
import type { ViewInputParams } from '@renderer/worker/server/services/viewInputParams.service'
import { FALLBACK_FONT_LIST } from './labelFont'

// --- Category tree ---

/** A node in the settings category tree. */
export interface CategoryNode {
  /** Unique identifier -- also used as the settings category key. */
  id: string
  /** Display label. */
  label: string
  /** Semantic icon key (see `AppIcon`). */
  icon: AppIconKey
  /** Child categories (empty for leaf nodes). */
  children: CategoryNode[]
}

export const CATEGORY_TREE: CategoryNode[] = [
  {
    id: 'display',
    label: 'Display',
    icon: 'settings.display',
    children: [
      { id: 'display.theme',      label: 'Theme',       icon: 'settings.theme',      children: [] },
      { id: 'display.atomLabels', label: 'Atom Labels',  icon: 'settings.atomLabels', children: [] },
      { id: 'display.rendering',  label: 'Rendering',    icon: 'settings.rendering',  children: [] },
    ],
  },
  {
    id: 'input',
    label: 'Input',
    icon: 'settings.input',
    children: [
      { id: 'input.mouse', label: 'Mouse & Navigation', icon: 'settings.mouse', children: [] },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: 'settings.rendering',
    children: [
      { id: 'tools.apbs', label: 'APBS / PDB2PQR', icon: 'settings.rendering', children: [] },
    ],
  },
]

/** All leaf-node ids, in tree order. */
export const ALL_LEAF_IDS: string[] = CATEGORY_TREE.flatMap((parent) =>
  parent.children.length > 0
    ? parent.children.map((c) => c.id)
    : [parent.id],
)

// --- Setting definitions ---

export type SettingControl =
  | { kind: 'select'; options: string[]; renderInOwnFont?: boolean }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle' }
  | { kind: 'color' }
  | { kind: 'path'; directory?: boolean }

export interface SettingDef {
  key: string
  label: string
  description: string
  /** Must match a leaf-node id in `CATEGORY_TREE`. */
  category: string
  control: SettingControl
}

export const SETTINGS: SettingDef[] = [
  // --- Display > Theme ---
  {
    key: 'display.darkMode',
    label: 'Dark Mode',
    description: 'Switch between dark and light colour themes.',
    category: 'display.theme',
    control: { kind: 'toggle' },
  },

  // --- Display > Atom Labels ---
  {
    key: 'atomLabel.font',
    label: 'Atom Label Font',
    description: 'Font family used for atom labels in the 3D viewport.',
    category: 'display.atomLabels',
    // Options are replaced at runtime with the installed system fonts
    // (SettingsPane + useSystemFonts); this list is only the pre-load fallback.
    control: { kind: 'select', options: FALLBACK_FONT_LIST, renderInOwnFont: true },
  },
  {
    key: 'atomLabel.size',
    label: 'Atom Label Size',
    description: 'Font size in pixels for atom labels.',
    category: 'display.atomLabels',
    control: { kind: 'number', min: 6, max: 72, step: 1, unit: 'px' },
  },
  {
    key: 'atomLabel.color',
    label: 'Atom Label Color',
    description: 'Color of atom label text in the viewport.',
    category: 'display.atomLabels',
    control: { kind: 'color' },
  },
  {
    key: 'atomLabel.bold',
    label: 'Atom Label Bold',
    description: 'Render atom labels in bold weight.',
    category: 'display.atomLabels',
    control: { kind: 'toggle' },
  },
  {
    key: 'atomLabel.italic',
    label: 'Atom Label Italic',
    description: 'Render atom labels in italic style.',
    category: 'display.atomLabels',
    control: { kind: 'toggle' },
  },

  // --- Display > Rendering ---
  {
    key: 'rendering.povrayExe',
    label: 'POV-Ray Executable',
    description: 'Path to the POV-Ray binary used for ray-traced rendering.',
    category: 'display.rendering',
    control: { kind: 'path' },
  },
  {
    key: 'rendering.povrayInc',
    label: 'POV-Ray Include Directory',
    description: 'Directory containing the POV-Ray standard include files.',
    category: 'display.rendering',
    control: { kind: 'path', directory: true },
  },
  {
    key: 'rendering.blendpng',
    label: 'blendpng Executable',
    description: 'Path to the blendpng tool that composites render layers.',
    category: 'display.rendering',
    control: { kind: 'path' },
  },
  {
    key: 'rendering.ffmpeg',
    label: 'ffmpeg Executable',
    description: 'Path to the ffmpeg binary used to encode movie renders.',
    category: 'display.rendering',
    control: { kind: 'path' },
  },

  // --- Tools > APBS / PDB2PQR ---
  {
    key: 'tools.apbsExe',
    label: 'APBS Executable',
    description: 'Path to the APBS binary used to compute electrostatic potential maps.',
    category: 'tools.apbs',
    control: { kind: 'path' },
  },
  {
    key: 'tools.pdb2pqrExe',
    label: 'pdb2pqr Executable',
    description: 'Path to the pdb2pqr tool that assigns atomic charges and radii.',
    category: 'tools.apbs',
    control: { kind: 'path' },
  },
  {
    key: 'tools.pdb2pqrFF',
    label: 'pdb2pqr Force Field',
    description: 'Default force field used by pdb2pqr for charge assignment.',
    category: 'tools.apbs',
    control: { kind: 'select', options: [...PDB2PQR_FORCE_FIELDS] },
  },

  // --- Input > Mouse & Navigation ---
  {
    key: 'input.device',
    label: 'Pointing device',
    description:
      'How scroll input maps to navigation. Mouse: wheel zooms. ' +
      'Mac trackpad: two-finger scroll pans, pinch zooms. ' +
      'Auto-detect: pick from the scroll stream (pinch/rotate force trackpad).',
    category: 'input.mouse',
    control: { kind: 'select', options: INPUT_DEVICE_PREF_OPTIONS },
  },
  {
    key: 'mouse.xyRotSensitivity',
    label: 'XY Rotation Sensitivity',
    description: 'Mouse sensitivity for rotating the view around X/Y axes.',
    category: 'input.mouse',
    control: { kind: 'number', min: 0.1, max: 5.0, step: 0.1 },
  },
  {
    key: 'mouse.pickPrecision',
    label: 'Pick Precision',
    description: 'Pixel radius for atom/object picking in the viewport.',
    category: 'input.mouse',
    control: { kind: 'number', min: 1, max: 50, step: 1, unit: 'px' },
  },
]

// --- Default values ---
// Pre-load fallbacks shown before the live backend value resolves. The
// atom-label and mouse values are seeded from C++ on mount (AppSettingsContext);
// the render paths from RenderConfigContext; theme from ThemeContext.

export const DEFAULTS: Record<string, string | number | boolean> = {
  'display.darkMode': true,
  'atomLabel.font': 'sans-serif',
  'atomLabel.size': 12,
  'atomLabel.color': '#FFFF00',
  'atomLabel.bold': false,
  'atomLabel.italic': false,
  'rendering.povrayExe': DEFAULT_RENDER_BINARIES.povrayExe,
  'rendering.povrayInc': DEFAULT_RENDER_BINARIES.povrayInc,
  'rendering.blendpng': DEFAULT_RENDER_BINARIES.blendpng,
  'rendering.ffmpeg': DEFAULT_RENDER_BINARIES.ffmpeg,
  'tools.apbsExe': DEFAULT_APBS_BINARIES.apbsExe,
  'tools.pdb2pqrExe': DEFAULT_APBS_BINARIES.pdb2pqrExe,
  'tools.pdb2pqrFF': DEFAULT_PDB2PQR_FF,
  'input.device': INPUT_DEVICE_PREF_LABELS.auto,
  'mouse.xyRotSensitivity': 0.8,
  'mouse.pickPrecision': 10.0,
}

// --- Label lookup: maps leaf category ids to their display titles ---

/** Recursively flatten the category tree into an `{ id: label }` map. */
function buildLabelMap(nodes: CategoryNode[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const node of nodes) {
    map[node.id] = node.label
    if (node.children.length > 0) {
      Object.assign(map, buildLabelMap(node.children))
    }
  }
  return map
}

export const CATEGORY_LABELS = buildLabelMap(CATEGORY_TREE)

// --- Render-binary settings ---
// These setting keys are backed by RenderConfigContext (persistent paths),
// not the local `values` state. SettingsPane routes them accordingly.

export const RENDER_BINARY_SETTING_KEYS: Record<string, keyof RenderBinaries> = {
  'rendering.povrayExe': 'povrayExe',
  'rendering.povrayInc': 'povrayInc',
  'rendering.blendpng': 'blendpng',
  'rendering.ffmpeg': 'ffmpeg',
}

// --- APBS tool settings ---
// Backed by ApbsConfigContext (persistent paths + default force field), not the
// local `values` state. SettingsPane routes these keys to the context.

export const APBS_SETTING_KEYS: Record<string, ApbsConfigKey> = {
  'tools.apbsExe': 'apbsExe',
  'tools.pdb2pqrExe': 'pdb2pqrExe',
  'tools.pdb2pqrFF': 'pdb2pqrFF',
}

// --- Pointing-device preset setting ---
// Backed by ViewInputConfigContext (persistent + live re-apply), not the local
// `values` state. SettingsPane routes this key to the context.

export const INPUT_DEVICE_SETTING_KEY = 'input.device'

// --- Atom-label default settings ---
// Backed by StyleManager `DefaultLabel.*` via AppSettingsContext. Maps the
// catalogue key to the LabelDefaults field.

export const LABEL_DEFAULT_SETTING_KEYS: Record<string, keyof LabelDefaults> = {
  'atomLabel.font': 'fontName',
  'atomLabel.size': 'fontSize',
  'atomLabel.color': 'color',
  'atomLabel.bold': 'bold',
  'atomLabel.italic': 'italic',
}

// --- View-input scalar settings ---
// Backed by ViewInputConfig `tbrad` / `hitprec` via AppSettingsContext.

export const VIEW_INPUT_PARAM_SETTING_KEYS: Record<string, keyof ViewInputParams> = {
  'mouse.xyRotSensitivity': 'tbrad',
  'mouse.pickPrecision': 'hitprec',
}
