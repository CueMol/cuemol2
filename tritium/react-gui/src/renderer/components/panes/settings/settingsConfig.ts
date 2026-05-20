/**
 * @file components/panes/settings/settingsConfig.ts
 * @description Declarative catalogue for the SettingsPane: the category
 * tree, the setting definitions, and their default values.
 *
 * Mock data: only `display.darkMode` is wired to a real backing
 * (ThemeContext). Real persistence lands when the backend config API is
 * ready; at that point this file is the single place the catalogue is
 * swapped, while SettingsPane / ConfigTreeNode / SettingRow stay generic.
 */

import type { IconName } from '@blueprintjs/icons'
import type { RenderBinaries } from '../../../worker/shared/renderTypes'
import { DEFAULT_RENDER_BINARIES } from '../../../worker/shared/renderTypes'

// --- Category tree ---

/** A node in the settings category tree. */
export interface CategoryNode {
  /** Unique identifier — also used as the settings category key. */
  id: string
  /** Display label. */
  label: string
  /** Blueprint icon name. */
  icon: IconName
  /** Child categories (empty for leaf nodes). */
  children: CategoryNode[]
}

export const CATEGORY_TREE: CategoryNode[] = [
  {
    id: 'display',
    label: 'Display',
    icon: 'eye-open',
    children: [
      { id: 'display.theme',      label: 'Theme',       icon: 'contrast',  children: [] },
      { id: 'display.atomLabels', label: 'Atom Labels',  icon: 'font',      children: [] },
      { id: 'display.rendering',  label: 'Rendering',    icon: 'cube',      children: [] },
      { id: 'display.colors',     label: 'Colors',       icon: 'tint',      children: [] },
    ],
  },
  {
    id: 'input',
    label: 'Input',
    icon: 'hand',
    children: [
      { id: 'input.mouse',    label: 'Mouse & Navigation', icon: 'move',        children: [] },
      { id: 'input.keyboard', label: 'Keyboard Shortcuts',  icon: 'key-command', children: [] },
      { id: 'input.trackpad', label: 'Trackpad',            icon: 'hand-up',     children: [] },
    ],
  },
  {
    id: 'general',
    label: 'General',
    icon: 'cog',
    children: [
      { id: 'general.language', label: 'Language & Region', icon: 'globe',          children: [] },
      { id: 'general.updates',  label: 'Updates',           icon: 'cloud-download', children: [] },
      { id: 'general.privacy',  label: 'Privacy',           icon: 'shield',         children: [] },
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
  | { kind: 'select'; options: string[] }
  | { kind: 'number'; min: number; max: number; step: number; minorStep?: number }
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
    control: { kind: 'select', options: ['Osaka', 'Helvetica', 'Arial', 'Monaco', 'Menlo', 'Courier New'] },
  },
  {
    key: 'atomLabel.size',
    label: 'Atom Label Size',
    description: 'Font size in points for atom labels.',
    category: 'display.atomLabels',
    control: { kind: 'number', min: 6, max: 72, step: 1 },
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
    key: 'rendering.hiDpi',
    label: 'Enable HiDPI (Retina) Display',
    description: 'Use high-resolution rendering on HiDPI screens. Requires restart.',
    category: 'display.rendering',
    control: { kind: 'toggle' },
  },
  {
    key: 'rendering.antiAlias',
    label: 'Anti-aliasing',
    description: 'Enable multi-sample anti-aliasing for smoother edges.',
    category: 'display.rendering',
    control: { kind: 'toggle' },
  },
  {
    key: 'rendering.shadows',
    label: 'Shadows',
    description: 'Render shadows cast by molecular objects.',
    category: 'display.rendering',
    control: { kind: 'toggle' },
  },
  {
    key: 'rendering.ambientOcclusion',
    label: 'Ambient Occlusion',
    description: 'Apply screen-space ambient occlusion for depth perception.',
    category: 'display.rendering',
    control: { kind: 'toggle' },
  },
  {
    key: 'rendering.fogDensity',
    label: 'Fog Density',
    description: 'Depth-cue fog intensity applied to distant objects.',
    category: 'display.rendering',
    control: { kind: 'number', min: 0, max: 1.0, step: 0.05, minorStep: 0.01 },
  },
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

  // --- Display > Colors ---
  {
    key: 'colors.background',
    label: 'Background Color',
    description: 'Viewport background color.',
    category: 'display.colors',
    control: { kind: 'color' },
  },
  {
    key: 'colors.selectionHighlight',
    label: 'Selection Highlight',
    description: 'Color used to highlight selected atoms and residues.',
    category: 'display.colors',
    control: { kind: 'color' },
  },
  {
    key: 'colors.labelBackground',
    label: 'Label Background',
    description: 'Background color behind atom labels for readability.',
    category: 'display.colors',
    control: { kind: 'color' },
  },

  // --- Input > Mouse & Navigation ---
  {
    key: 'mouse.preset',
    label: 'View Operation Preset',
    description: 'Pre-configured mouse button mapping for 3D navigation.',
    category: 'input.mouse',
    control: { kind: 'select', options: ['Default', 'Maya-like', 'PyMOL-like', 'Custom'] },
  },
  {
    key: 'mouse.xyRotSensitivity',
    label: 'XY Rotation Sensitivity',
    description: 'Mouse sensitivity for rotating the view around X/Y axes.',
    category: 'input.mouse',
    control: { kind: 'number', min: 0.1, max: 5.0, step: 0.1, minorStep: 0.01 },
  },
  {
    key: 'mouse.pickPrecision',
    label: 'Pick Precision',
    description: 'Pixel radius for atom/object picking in the viewport.',
    category: 'input.mouse',
    control: { kind: 'number', min: 1, max: 50, step: 1, minorStep: 0.1 },
  },
  {
    key: 'mouse.momentumScroll',
    label: 'Momentum Scroll',
    description: 'Enable inertial scrolling for trackpad zoom gestures.',
    category: 'input.mouse',
    control: { kind: 'toggle' },
  },

  // --- Input > Keyboard Shortcuts ---
  {
    key: 'keyboard.enableVimMode',
    label: 'Vim-style Navigation',
    description: 'Use Vim-like key bindings for viewport navigation (H/J/K/L).',
    category: 'input.keyboard',
    control: { kind: 'toggle' },
  },
  {
    key: 'keyboard.enableQuickCommand',
    label: 'Quick Command Palette',
    description: 'Enable Ctrl+Shift+P command palette for quick access to actions.',
    category: 'input.keyboard',
    control: { kind: 'toggle' },
  },

  // --- Input > Trackpad ---
  {
    key: 'trackpad.multiTouch',
    label: 'Enable Multi-touch Trackpad',
    description: 'Use pinch-to-zoom and two-finger rotate on supported trackpads.',
    category: 'input.trackpad',
    control: { kind: 'toggle' },
  },
  {
    key: 'trackpad.emulateRightButton',
    label: 'Emulate Mouse Right Button',
    description: 'Treat Ctrl+Click as a right-click for single-button mice.',
    category: 'input.trackpad',
    control: { kind: 'toggle' },
  },
  {
    key: 'trackpad.scrollDirection',
    label: 'Scroll Direction',
    description: 'Scroll direction for zoom operations.',
    category: 'input.trackpad',
    control: { kind: 'select', options: ['Natural', 'Inverted'] },
  },

  // --- General > Language & Region ---
  {
    key: 'general.language',
    label: 'Language',
    description: 'User interface language. Requires restart.',
    category: 'general.language',
    control: { kind: 'select', options: ['English', 'Japanese'] },
  },
  {
    key: 'general.dateFormat',
    label: 'Date Format',
    description: 'Format used for dates in the log panel and file metadata.',
    category: 'general.language',
    control: { kind: 'select', options: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'] },
  },

  // --- General > Updates ---
  {
    key: 'updates.autoCheck',
    label: 'Check for Updates Automatically',
    description: 'Periodically check for new application versions.',
    category: 'general.updates',
    control: { kind: 'toggle' },
  },
  {
    key: 'updates.channel',
    label: 'Update Channel',
    description: 'Which release channel to follow for updates.',
    category: 'general.updates',
    control: { kind: 'select', options: ['Stable', 'Beta', 'Nightly'] },
  },

  // --- General > Privacy ---
  {
    key: 'privacy.telemetry',
    label: 'Send Usage Statistics',
    description: 'Help improve CueMol by sending anonymous usage data.',
    category: 'general.privacy',
    control: { kind: 'toggle' },
  },
  {
    key: 'privacy.crashReports',
    label: 'Send Crash Reports',
    description: 'Automatically send crash reports when the application encounters an error.',
    category: 'general.privacy',
    control: { kind: 'toggle' },
  },
]

// --- Default values (mock state) ---

export const DEFAULTS: Record<string, string | number | boolean> = {
  'display.darkMode': true,
  'atomLabel.font': 'Osaka',
  'atomLabel.size': 12,
  'atomLabel.color': '#FFFF00',
  'atomLabel.bold': false,
  'atomLabel.italic': false,
  'rendering.hiDpi': true,
  'rendering.antiAlias': true,
  'rendering.shadows': false,
  'rendering.ambientOcclusion': false,
  'rendering.fogDensity': 0.3,
  'rendering.povrayExe': DEFAULT_RENDER_BINARIES.povrayExe,
  'rendering.povrayInc': DEFAULT_RENDER_BINARIES.povrayInc,
  'rendering.blendpng': DEFAULT_RENDER_BINARIES.blendpng,
  'colors.background': '#1E2028',
  'colors.selectionHighlight': '#5FAFD7',
  'colors.labelBackground': '#000000',
  'mouse.preset': 'Default',
  'mouse.xyRotSensitivity': 0.8,
  'mouse.pickPrecision': 10.0,
  'mouse.momentumScroll': true,
  'keyboard.enableVimMode': false,
  'keyboard.enableQuickCommand': true,
  'trackpad.multiTouch': true,
  'trackpad.emulateRightButton': true,
  'trackpad.scrollDirection': 'Natural',
  'general.language': 'English',
  'general.dateFormat': 'YYYY-MM-DD',
  'updates.autoCheck': true,
  'updates.channel': 'Stable',
  'privacy.telemetry': false,
  'privacy.crashReports': true,
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
// not the mock `values` state. SettingsPane routes them accordingly.

export const RENDER_BINARY_SETTING_KEYS: Record<string, keyof RenderBinaries> = {
  'rendering.povrayExe': 'povrayExe',
  'rendering.povrayInc': 'povrayInc',
  'rendering.blendpng': 'blendpng',
}
