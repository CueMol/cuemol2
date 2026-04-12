/**
 * Tab content pane for "settings" tabs.
 *
 * VS Code–style settings pane with a left-side category tree
 * and a right-side scrollable settings list.
 *
 * ## Layout
 *
 * ```
 * ┌─────────────────┬────────────────────────────────────────┐
 * │  🔍 Search...   │  🔍 Search...                          │
 * ├─────────────────┼────────────────────────────────────────┤
 * │ ▾ Display       │  THEME                                 │
 * │   Theme       ● │  ──────────────────────                │
 * │   Atom Labels   │  Dark Mode                             │
 * │   Rendering     │  Switch between dark and light...  [⊙] │
 * │   Colors        │                                        │
 * │ ▾ Input         │                                        │
 * │   Mouse & Nav   │                                        │
 * │   Keyboard      │                                        │
 * │   Trackpad      │                                        │
 * │ ▾ General       │                                        │
 * │   Language       │                                        │
 * │   Updates       │                                        │
 * │   Privacy       │                                        │
 * └─────────────────┴────────────────────────────────────────┘
 * ```
 *
 * Clicking a leaf node in the tree scrolls-to / filters the settings
 * panel on the right. Clicking a parent node expands or collapses it.
 *
 * The theme toggle is wired to `ThemeContext` for live switching and
 * electron-store persistence. Other values are mockup-only; real
 * persistence will be wired up when the backend config API is ready.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Icon,
  HTMLSelect,
  NumericInput,
  Switch,
  InputGroup,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { useTheme } from "../contexts/ThemeContext";

// ────────────────────────────────────────────────────────────
// Category tree definition
// ────────────────────────────────────────────────────────────

/** A node in the settings category tree. */
interface CategoryNode {
  /** Unique identifier — also used as the settings category key. */
  id: string;
  /** Display label. */
  label: string;
  /** Blueprint icon name. */
  icon: IconName;
  /** Child categories (empty for leaf nodes). */
  children: CategoryNode[];
}

const CATEGORY_TREE: CategoryNode[] = [
  {
    id: "display",
    label: "Display",
    icon: "eye-open",
    children: [
      { id: "display.theme",      label: "Theme",       icon: "contrast",  children: [] },
      { id: "display.atomLabels", label: "Atom Labels",  icon: "font",      children: [] },
      { id: "display.rendering",  label: "Rendering",    icon: "cube",      children: [] },
      { id: "display.colors",     label: "Colors",       icon: "tint",      children: [] },
    ],
  },
  {
    id: "input",
    label: "Input",
    icon: "hand",
    children: [
      { id: "input.mouse",    label: "Mouse & Navigation", icon: "move",        children: [] },
      { id: "input.keyboard", label: "Keyboard Shortcuts",  icon: "key-command", children: [] },
      { id: "input.trackpad", label: "Trackpad",            icon: "hand-up",     children: [] },
    ],
  },
  {
    id: "general",
    label: "General",
    icon: "cog",
    children: [
      { id: "general.language", label: "Language & Region", icon: "globe",          children: [] },
      { id: "general.updates",  label: "Updates",           icon: "cloud-download", children: [] },
      { id: "general.privacy",  label: "Privacy",           icon: "shield",         children: [] },
    ],
  },
];

/** Collect all leaf-node ids for iteration. */
const ALL_LEAF_IDS: string[] = CATEGORY_TREE.flatMap((parent) =>
  parent.children.length > 0
    ? parent.children.map((c) => c.id)
    : [parent.id],
);

// ────────────────────────────────────────────────────────────
// Setting definition types
// ────────────────────────────────────────────────────────────

type SettingControl =
  | { kind: "select"; options: string[] }
  | { kind: "number"; min: number; max: number; step: number; minorStep?: number }
  | { kind: "toggle" }
  | { kind: "color" };

interface SettingDef {
  key: string;
  label: string;
  description: string;
  /** Must match a leaf-node id in `CATEGORY_TREE`. */
  category: string;
  control: SettingControl;
}

// ────────────────────────────────────────────────────────────
// Settings catalogue (mock data)
// ────────────────────────────────────────────────────────────

const SETTINGS: SettingDef[] = [
  // ── Display > Theme ──
  {
    key: "display.darkMode",
    label: "Dark Mode",
    description: "Switch between dark and light colour themes.",
    category: "display.theme",
    control: { kind: "toggle" },
  },

  // ── Display > Atom Labels ──
  {
    key: "atomLabel.font",
    label: "Atom Label Font",
    description: "Font family used for atom labels in the 3D viewport.",
    category: "display.atomLabels",
    control: { kind: "select", options: ["Osaka", "Helvetica", "Arial", "Monaco", "Menlo", "Courier New"] },
  },
  {
    key: "atomLabel.size",
    label: "Atom Label Size",
    description: "Font size in points for atom labels.",
    category: "display.atomLabels",
    control: { kind: "number", min: 6, max: 72, step: 1 },
  },
  {
    key: "atomLabel.color",
    label: "Atom Label Color",
    description: "Color of atom label text in the viewport.",
    category: "display.atomLabels",
    control: { kind: "color" },
  },
  {
    key: "atomLabel.bold",
    label: "Atom Label Bold",
    description: "Render atom labels in bold weight.",
    category: "display.atomLabels",
    control: { kind: "toggle" },
  },
  {
    key: "atomLabel.italic",
    label: "Atom Label Italic",
    description: "Render atom labels in italic style.",
    category: "display.atomLabels",
    control: { kind: "toggle" },
  },

  // ── Display > Rendering ──
  {
    key: "rendering.hiDpi",
    label: "Enable HiDPI (Retina) Display",
    description: "Use high-resolution rendering on HiDPI screens. Requires restart.",
    category: "display.rendering",
    control: { kind: "toggle" },
  },
  {
    key: "rendering.antiAlias",
    label: "Anti-aliasing",
    description: "Enable multi-sample anti-aliasing for smoother edges.",
    category: "display.rendering",
    control: { kind: "toggle" },
  },
  {
    key: "rendering.shadows",
    label: "Shadows",
    description: "Render shadows cast by molecular objects.",
    category: "display.rendering",
    control: { kind: "toggle" },
  },
  {
    key: "rendering.ambientOcclusion",
    label: "Ambient Occlusion",
    description: "Apply screen-space ambient occlusion for depth perception.",
    category: "display.rendering",
    control: { kind: "toggle" },
  },
  {
    key: "rendering.fogDensity",
    label: "Fog Density",
    description: "Depth-cue fog intensity applied to distant objects.",
    category: "display.rendering",
    control: { kind: "number", min: 0, max: 1.0, step: 0.05, minorStep: 0.01 },
  },

  // ── Display > Colors ──
  {
    key: "colors.background",
    label: "Background Color",
    description: "Viewport background color.",
    category: "display.colors",
    control: { kind: "color" },
  },
  {
    key: "colors.selectionHighlight",
    label: "Selection Highlight",
    description: "Color used to highlight selected atoms and residues.",
    category: "display.colors",
    control: { kind: "color" },
  },
  {
    key: "colors.labelBackground",
    label: "Label Background",
    description: "Background color behind atom labels for readability.",
    category: "display.colors",
    control: { kind: "color" },
  },

  // ── Input > Mouse & Navigation ──
  {
    key: "mouse.preset",
    label: "View Operation Preset",
    description: "Pre-configured mouse button mapping for 3D navigation.",
    category: "input.mouse",
    control: { kind: "select", options: ["Default", "Maya-like", "PyMOL-like", "Custom"] },
  },
  {
    key: "mouse.xyRotSensitivity",
    label: "XY Rotation Sensitivity",
    description: "Mouse sensitivity for rotating the view around X/Y axes.",
    category: "input.mouse",
    control: { kind: "number", min: 0.1, max: 5.0, step: 0.1, minorStep: 0.01 },
  },
  {
    key: "mouse.pickPrecision",
    label: "Pick Precision",
    description: "Pixel radius for atom/object picking in the viewport.",
    category: "input.mouse",
    control: { kind: "number", min: 1, max: 50, step: 1, minorStep: 0.1 },
  },
  {
    key: "mouse.momentumScroll",
    label: "Momentum Scroll",
    description: "Enable inertial scrolling for trackpad zoom gestures.",
    category: "input.mouse",
    control: { kind: "toggle" },
  },

  // ── Input > Keyboard Shortcuts ──
  {
    key: "keyboard.enableVimMode",
    label: "Vim-style Navigation",
    description: "Use Vim-like key bindings for viewport navigation (H/J/K/L).",
    category: "input.keyboard",
    control: { kind: "toggle" },
  },
  {
    key: "keyboard.enableQuickCommand",
    label: "Quick Command Palette",
    description: "Enable Ctrl+Shift+P command palette for quick access to actions.",
    category: "input.keyboard",
    control: { kind: "toggle" },
  },

  // ── Input > Trackpad ──
  {
    key: "trackpad.multiTouch",
    label: "Enable Multi-touch Trackpad",
    description: "Use pinch-to-zoom and two-finger rotate on supported trackpads.",
    category: "input.trackpad",
    control: { kind: "toggle" },
  },
  {
    key: "trackpad.emulateRightButton",
    label: "Emulate Mouse Right Button",
    description: "Treat Ctrl+Click as a right-click for single-button mice.",
    category: "input.trackpad",
    control: { kind: "toggle" },
  },
  {
    key: "trackpad.scrollDirection",
    label: "Scroll Direction",
    description: "Scroll direction for zoom operations.",
    category: "input.trackpad",
    control: { kind: "select", options: ["Natural", "Inverted"] },
  },

  // ── General > Language & Region ──
  {
    key: "general.language",
    label: "Language",
    description: "User interface language. Requires restart.",
    category: "general.language",
    control: { kind: "select", options: ["English", "Japanese"] },
  },
  {
    key: "general.dateFormat",
    label: "Date Format",
    description: "Format used for dates in the log panel and file metadata.",
    category: "general.language",
    control: { kind: "select", options: ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"] },
  },

  // ── General > Updates ──
  {
    key: "updates.autoCheck",
    label: "Check for Updates Automatically",
    description: "Periodically check for new application versions.",
    category: "general.updates",
    control: { kind: "toggle" },
  },
  {
    key: "updates.channel",
    label: "Update Channel",
    description: "Which release channel to follow for updates.",
    category: "general.updates",
    control: { kind: "select", options: ["Stable", "Beta", "Nightly"] },
  },

  // ── General > Privacy ──
  {
    key: "privacy.telemetry",
    label: "Send Usage Statistics",
    description: "Help improve CueMol by sending anonymous usage data.",
    category: "general.privacy",
    control: { kind: "toggle" },
  },
  {
    key: "privacy.crashReports",
    label: "Send Crash Reports",
    description: "Automatically send crash reports when the application encounters an error.",
    category: "general.privacy",
    control: { kind: "toggle" },
  },
];

// ────────────────────────────────────────────────────────────
// Default values (mock state)
// ────────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string | number | boolean> = {
  "display.darkMode": true,
  "atomLabel.font": "Osaka",
  "atomLabel.size": 12,
  "atomLabel.color": "#FFFF00",
  "atomLabel.bold": false,
  "atomLabel.italic": false,
  "rendering.hiDpi": true,
  "rendering.antiAlias": true,
  "rendering.shadows": false,
  "rendering.ambientOcclusion": false,
  "rendering.fogDensity": 0.3,
  "colors.background": "#1E2028",
  "colors.selectionHighlight": "#5FAFD7",
  "colors.labelBackground": "#000000",
  "mouse.preset": "Default",
  "mouse.xyRotSensitivity": 0.8,
  "mouse.pickPrecision": 10.0,
  "mouse.momentumScroll": true,
  "keyboard.enableVimMode": false,
  "keyboard.enableQuickCommand": true,
  "trackpad.multiTouch": true,
  "trackpad.emulateRightButton": true,
  "trackpad.scrollDirection": "Natural",
  "general.language": "English",
  "general.dateFormat": "YYYY-MM-DD",
  "updates.autoCheck": true,
  "updates.channel": "Stable",
  "privacy.telemetry": false,
  "privacy.crashReports": true,
};

// ────────────────────────────────────────────────────────────
// Label lookup — maps leaf category ids to their display titles
// ────────────────────────────────────────────────────────────

function buildLabelMap(nodes: CategoryNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes) {
    map[node.id] = node.label;
    if (node.children.length > 0) {
      Object.assign(map, buildLabelMap(node.children));
    }
  }
  return map;
}

const CATEGORY_LABELS = buildLabelMap(CATEGORY_TREE);

// ────────────────────────────────────────────────────────────
// Sub-component: Category tree node
// ────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: CategoryNode;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Count of settings in each leaf category (for badge display). */
  settingsCount: Record<string, number>;
  /** Set of parent ids to start expanded. */
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}

const ConfigTreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  selectedId,
  onSelect,
  settingsCount,
  expandedIds,
  onToggleExpand,
}) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const count = settingsCount[node.id] ?? 0;

  const handleClick = useCallback(() => {
    if (hasChildren) {
      onToggleExpand(node.id);
    } else {
      onSelect(node.id);
    }
  }, [node.id, hasChildren, onSelect, onToggleExpand]);

  return (
    <>
      <div
        className={`cfg-tree-item ${isSelected ? "selected" : ""} ${hasChildren ? "parent" : "leaf"}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="cfg-tree-chevron">
          {hasChildren ? (
            <Icon icon={isExpanded ? "chevron-down" : "chevron-right"} size={12} />
          ) : (
            <span style={{ width: 12 }} />
          )}
        </span>
        <Icon icon={node.icon} size={14} className="cfg-tree-icon" />
        <span className="cfg-tree-label">{node.label}</span>
        {!hasChildren && count > 0 && (
          <span className="cfg-tree-badge">{count}</span>
        )}
      </div>
      {isExpanded &&
        hasChildren &&
        node.children.map((child) => (
          <ConfigTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            settingsCount={settingsCount}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-component: individual setting row
// ────────────────────────────────────────────────────────────

interface SettingRowProps {
  def: SettingDef;
  value: string | number | boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}

const SettingRow: React.FC<SettingRowProps> = ({ def, value, onChange }) => {
  const { key, label, description, control } = def;

  const renderControl = () => {
    switch (control.kind) {
      case "select":
        return (
          <HTMLSelect
            className="config-setting-select"
            value={value as string}
            onChange={(e) => onChange(key, e.target.value)}
            options={control.options}
          />
        );
      case "number":
        return (
          <NumericInput
            className="config-setting-numeric"
            value={value as number}
            onValueChange={(val) => onChange(key, val)}
            min={control.min}
            max={control.max}
            stepSize={control.step}
            minorStepSize={control.minorStep}
          />
        );
      case "toggle":
        return (
          <Switch
            className="config-setting-switch"
            checked={value as boolean}
            onChange={(e) =>
              onChange(key, (e.target as HTMLInputElement).checked)
            }
            alignIndicator="right"
          />
        );
      case "color":
        return (
          <div className="config-setting-color-row">
            <input
              type="color"
              className="config-setting-color-swatch"
              value={value as string}
              onChange={(e) => onChange(key, e.target.value)}
            />
            <span className="config-setting-color-hex">{value as string}</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (control.kind === "toggle") {
    return (
      <div className="config-setting config-setting-toggle">
        <div className="config-setting-text">
          <div className="config-setting-label">{label}</div>
          <div className="config-setting-desc">{description}</div>
        </div>
        {renderControl()}
      </div>
    );
  }

  return (
    <div className="config-setting">
      <div className="config-setting-label">{label}</div>
      <div className="config-setting-desc">{description}</div>
      <div className="config-setting-control">{renderControl()}</div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

export const SettingsPane: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const [filter, setFilter] = useState("");
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => ({
    ...DEFAULTS,
    // Initialise from the live theme context so the toggle matches reality.
    "display.darkMode": theme === "dark",
  }));
  const [selectedCategory, setSelectedCategory] = useState(ALL_LEAF_IDS[0]);

  /* All parent nodes start expanded. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(CATEGORY_TREE.map((n) => n.id)),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setValues((prev) => ({ ...prev, [key]: value }));

      // Sync theme toggle with the ThemeContext.
      if (key === "display.darkMode") {
        setTheme(value ? "dark" : "light");
      }
    },
    [setTheme],
  );

  // Keep the toggle in sync if theme changes externally.
  useEffect(() => {
    setValues((prev) => {
      const isDark = theme === "dark";
      if (prev["display.darkMode"] === isDark) return prev;
      return { ...prev, "display.darkMode": isDark };
    });
  }, [theme]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Settings filtered by the search query. */
  const filtered = useMemo(() => {
    if (!filter.trim()) return SETTINGS;
    const q = filter.toLowerCase();
    return SETTINGS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q),
    );
  }, [filter]);

  /** Per-category setting count (for tree badges). */
  const settingsCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      counts[s.category] = (counts[s.category] ?? 0) + 1;
    }
    return counts;
  }, [filtered]);

  /** Leaf categories that have at least one visible setting. */
  const visibleLeaves = useMemo(
    () => ALL_LEAF_IDS.filter((id) => filtered.some((s) => s.category === id)),
    [filtered],
  );

  /** When searching, show all matching categories. Otherwise only the selected one. */
  const displayLeaves = filter.trim() ? visibleLeaves : visibleLeaves.filter((id) => id === selectedCategory);

  /** Select a category from the tree and scroll to it. */
  const handleCategorySelect = useCallback(
    (id: string) => {
      setSelectedCategory(id);
      if (!filter.trim()) {
        // When not searching, scroll is instant because we only show one category.
        scrollRef.current?.scrollTo({ top: 0 });
      } else {
        // When searching, scroll to the section header.
        const el = sectionRefs.current[id];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [filter],
  );

  /* Highlight the tree node that corresponds to the category currently
     scrolled into view when in search mode. */
  const handleScroll = useCallback(() => {
    if (!filter.trim() || !scrollRef.current) return;
    const container = scrollRef.current;
    const top = container.scrollTop + 8;
    for (const id of visibleLeaves) {
      const el = sectionRefs.current[id];
      if (el && el.offsetTop <= top && el.offsetTop + el.offsetHeight > top) {
        setSelectedCategory(id);
        break;
      }
    }
  }, [filter, visibleLeaves]);

  const matchCount = filtered.length;

  return (
    <div className="config-pane">
      {/* ── Left: category tree ── */}
      <div className="config-tree-panel">
        <div className="config-tree-header">
          <Icon icon="cog" size={14} className="config-tree-header-icon" />
          <span className="config-tree-header-title">Settings</span>
        </div>
        <div className="config-tree-scroll">
          {CATEGORY_TREE.map((node) => (
            <ConfigTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedCategory}
              onSelect={handleCategorySelect}
              settingsCount={settingsCount}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </div>
      </div>

      {/* ── Right: settings list ── */}
      <div className="config-content-panel">
        {/* Search bar */}
        <div className="config-search-bar">
          <InputGroup
            className="config-search-input"
            leftIcon={<Icon icon="search" size={14} />}
            placeholder="Search settings…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            rightElement={
              filter ? (
                <button
                  className="config-search-clear bp5-button bp5-minimal bp5-small"
                  onClick={() => setFilter("")}
                >
                  <Icon icon="cross" size={14} />
                </button>
              ) : undefined
            }
          />
          {filter && (
            <span className="config-search-count">
              {matchCount} {matchCount === 1 ? "setting" : "settings"}
            </span>
          )}
        </div>

        {/* Settings body */}
        <div className="config-scroll" ref={scrollRef} onScroll={handleScroll}>
          {displayLeaves.map((catId) => (
            <div
              key={catId}
              className="config-category"
              ref={(el) => { sectionRefs.current[catId] = el; }}
            >
              <div className="config-category-header">
                {CATEGORY_LABELS[catId] ?? catId}
              </div>
              {filtered
                .filter((s) => s.category === catId)
                .map((s) => (
                  <SettingRow
                    key={s.key}
                    def={s}
                    value={values[s.key]}
                    onChange={handleChange}
                  />
                ))}
            </div>
          ))}

          {displayLeaves.length === 0 && (
            <div className="config-no-results">
              <Icon icon="search" size={32} className="config-no-results-icon" />
              <span>No settings match "{filter}"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
