/**
 * @file features/settings/settings/settingsConfig.ts
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
import { OPEN_FILE_TARGET_OPTIONS, OPEN_FILE_TARGET_LABELS } from '@renderer/data/openFileTarget'
import type { LabelDefaults } from '@renderer/worker/server/services/view/labelDefaults'
import type { ViewInputParams } from '@renderer/worker/server/services/view/viewInputParams'
import type { PickingPrefs } from '@renderer/contexts/PickingPrefsContext'
import { FALLBACK_FONT_LIST } from './labelFont'
import type { PluginPrefValue } from '@shared/types/uiPrefs'
import type { SettingControl } from './settingControl'

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
    id: 'general',
    label: 'General',
    icon: 'settings.general',
    children: [
      { id: 'general.files', label: 'Files', icon: 'ui.folder', children: [] },
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
  // The one branch nothing below fills in: its children are generated from
  // the plugin registry (see settings/pluginSettings.ts). `Installed` holds
  // the on / off switches; each plugin that contributes settings rows gets a
  // leaf of its own next to it.
  {
    id: 'plugins',
    label: 'Plugins',
    icon: 'settings.plugins',
    children: [
      { id: 'plugins.installed', label: 'Installed', icon: 'settings.plugins', children: [] },
    ],
  },
]

/** Leaf-node ids of `tree`, in tree order. */
export function leafIds(tree: readonly CategoryNode[]): string[] {
  return tree.flatMap((parent) =>
    parent.children.length > 0 ? parent.children.map((c) => c.id) : [parent.id],
  )
}

/**
 * Leaf ids of the static tree.
 *
 * The nav store uses this for its initial selection and expansion, which must
 * not depend on which plugins happen to be enabled. The pane itself walks the
 * tree it actually draws (plugin leaves included).
 */
export const ALL_LEAF_IDS: string[] = leafIds(CATEGORY_TREE)

// --- Setting definitions ---

export type { SettingControl } from './settingControl'

export interface SettingDef {
  key: string
  label: string
  description: string
  /** Must match a leaf-node id in the category tree. */
  category: string
  control: SettingControl
  /**
   * Value to show when nothing is stored. Used by the generated plugin rows,
   * whose defaults live in the contributing plugin's manifest rather than in
   * `DEFAULTS` below.
   */
  default?: PluginPrefValue
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
  // --- General > Files ---
  {
    key: 'files.dropTarget',
    label: 'Drag and drop opens into',
    description:
      'Where a file dragged onto the window is loaded. Current scene: added to the scene ' +
      'in the active tab. New scene: opened in a tab of its own, unless the active scene ' +
      'is still empty. Files dropped together share one scene. Scene files (.qsc) are ' +
      'unaffected, and File > Open always uses the current scene.',
    category: 'general.files',
    control: { kind: 'select', options: OPEN_FILE_TARGET_OPTIONS },
  },
  {
    key: 'files.shellTarget',
    label: 'File manager opens into',
    description:
      'The same, for a file opened from Finder / Explorer, named on the command line, or ' +
      'handed over by a second launch.',
    category: 'general.files',
    control: { kind: 'select', options: OPEN_FILE_TARGET_OPTIONS },
  },
  {
    key: 'picking.gpuPicking',
    label: 'GPU Picking',
    description:
      'Pick what is actually drawn (cartoon ribbons, sticks, spheres) by rendering ' +
      'object IDs on the GPU. Off falls back to picking atom centres only; ' +
      'turn it off on slow hosts. Takes effect on the next click / hover.',
    category: 'input.mouse',
    control: { kind: 'toggle' },
  },
  {
    key: 'picking.hoverInfo',
    label: 'Hover Info',
    description:
      'Show what is under the pointer in the corner of the 3D view while moving the mouse. ' +
      'Off stops the hover hit tests entirely.',
    category: 'input.mouse',
    control: { kind: 'toggle' },
  },
  {
    key: 'picking.hoverHighlight',
    label: 'Hover Highlight',
    description:
      'Highlight the element under the pointer in the 3D view (a translucent fill and ' +
      'outline drawn from the GPU pick buffer, no scene redraw). Needs GPU Picking and Hover Info.',
    category: 'input.mouse',
    control: { kind: 'toggle' },
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
  'picking.gpuPicking': true,
  'picking.hoverInfo': true,
  'picking.hoverHighlight': true,
  'files.dropTarget': OPEN_FILE_TARGET_LABELS.active,
  'files.shellTarget': OPEN_FILE_TARGET_LABELS.active,
}

// --- Label lookup: maps leaf category ids to their display titles ---

/** Recursively flatten a category tree into an `{ id: label }` map. */
export function buildLabelMap(nodes: readonly CategoryNode[]): Record<string, string> {
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

// --- 3D view picking preferences ---
// Backed by PickingPrefsContext (electron-store; gpuPicking also pushed to
// ViewInputConfig.gpu_pick).

export const PICKING_PREF_SETTING_KEYS: Record<string, keyof PickingPrefs> = {
  'picking.gpuPicking': 'gpuPicking',
  'picking.hoverInfo': 'hoverInfo',
  'picking.hoverHighlight': 'hoverHighlight',
}

// --- File-open target preferences ---
// Backed by FileOpenPrefsContext (electron-store). One key per entry point
// that carries an expectation of its own; the in-app File > Open paths have
// no row because they always use the current scene.

export const DROP_TARGET_SETTING_KEY = 'files.dropTarget'
export const SHELL_TARGET_SETTING_KEY = 'files.shellTarget'
