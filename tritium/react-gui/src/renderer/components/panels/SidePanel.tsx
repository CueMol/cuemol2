/**
 * @file SidePanel.tsx
 * @description Sidebar container that renders different pane sets depending
 * on the currently active Activity Bar view.
 *
 * ## Architecture (N-pane generalization)
 *
 * Each view defines an ordered list of `PaneConfig` entries. The
 * generic `renderView()` helper builds an Allotment with the correct
 * number of children, applying collapse/expand constraints and size
 * tracking that works correctly for any pane count.
 *
 * ## Views and Panes
 *
 * | View       | Panes                                       |
 * |------------|---------------------------------------------|
 * | Explorer   | ScenePane, ColorPane, DummyPane4            |
 * | Selection  | MolStructPane, SelectionPane                |
 * | Crystal    | SymmetryPane, DensityMapPane, DummyPane3    |
 *
 * New views and panes can be added by editing `buildViewPaneConfigs()`
 * without touching the layout / persistence logic.
 *
 * ## Terminology
 *
 * - **View**: Activity bar-selectable container (ExplorerView, SelectionView)
 * - **Pane**: Individual section within a view (ScenePane, ColorPane, etc.)
 * - **PaneConfig**: Configuration for a single pane (id, defaultSize, render)
 *
 * ## Collapse-size tracking (bug fix for N > 2)
 *
 * When any pane is collapsed, Allotment redistributes the freed space
 * among the remaining open panes. Those inflated sizes must never
 * overwrite the "last known good" open sizes. This implementation uses
 * a `Record<string, number>` keyed by pane id so it scales to any
 * number of panes.
 *
 * ## Persistence
 *
 * Splitter positions and collapse states are persisted via callback
 * props supplied by the parent (ultimately backed by
 * `useLayoutPersistence`). The component itself is stateless with
 * respect to layout; all layout state lives in the parent.
 *
 * @module SidePanel
 */

import React, { useCallback, useRef, useMemo } from "react";
import { Allotment } from "allotment";
import { Icon } from "@blueprintjs/core";

import type { ActivityView } from "../ActivityBar";
import type { PaneCollapseState } from "../../hooks/useLayoutPersistence";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";

import type { MoveSceneNodeArgs } from "../panes/sceneTreeDnd";
import {
  ScenePane,
  ColorPane,
  MolStructPane,
  SelectionPane,
  SymmetryPane,
  DensityMapPane,
  DummyPane3,
  DummyPane4,
} from "../panes";

import type { SceneTreeNode } from "../../worker/shared/sceneTreeTypes";

/* --- Re-export types for external consumers --- */
export type { SceneTreeNode } from "../../worker/shared/sceneTreeTypes";

/* --- Constants --- */

/** Height of a collapsed pane (header-only). */
const HEADER_HEIGHT = 28;

/* --- View title / icon mapping --- */

const VIEW_TITLES: Record<ActivityView, string> = {
  explorer: "Explorer",
  selection: "Selection",
  crystal: "Crystal",
  catalog: "Component Catalog",
};

const VIEW_ICONS: Record<ActivityView, string> = {
  explorer: "panel-table",
  selection: "search",
  crystal: "cube",
  catalog: "widget",
};

/* --- Pane configuration type --- */

/**
 * Describes a single pane within a view's Allotment.
 * New panes can be added to a view by appending entries to the config
 * array — no structural code changes required.
 */
interface PaneConfig {
  /** Unique key within the view (used for collapse-state lookup). */
  id: string;
  /** Fallback size when no persisted value exists. */
  defaultSize: number;
  /** Render function receiving collapse state and toggle callback. */
  render: (collapsed: boolean, onToggleCollapse: () => void) => React.ReactNode;
}

/* --- Props --- */

interface SidePanelProps {
  /** Which activity-bar view is active. */
  activeView: ActivityView;

  /** AsyncCueMol bridge; null until the worker finishes initialising. */
  cm: AsyncCueMol | null;
  /** Active scene UID, or undefined when no scene is active. */
  activeSceneId: number | undefined;
  /** Active mol-view UID for the focused molview tab. */
  activeMolViewId: number | undefined;

  /* Scene / Explorer props */
  sceneTree: SceneTreeNode | null;
  sceneSelected: string;
  /** Multi-select set. */
  sceneSelectedIds?: Set<string>;
  onSceneSelect: (id: string) => void;
  /** Cmd/Ctrl+click toggle handler for multi-select. */
  onSceneToggleSelect?: (id: string) => void;
  onToggleVisibility: (id: string) => void;

  /** Called when the user clicks the Property button in ScenePane. */
  onShowProperty?: (id: string) => void;
  /** Called when the user clicks the Focus button in ScenePane. */
  onFocusSelected?: (id: string) => void;
  /** Called when the user clicks the Delete button in ScenePane. */
  onDeleteSelected?: (id: string) => void;
  /** Called when the user clicks the Add (Renderer) toolbar button. */
  onAddSelected?: () => void;
  /** Called when the user double-clicks a scene-tree row. */
  onSceneNodeDoubleClick?: (node: SceneTreeNode) => void;
  /**
   * Controlled inline-rename target. A non-null id means that row shows
   * an editor. `useSceneTreeController` owns this state so the F2 keypath
   * and the ctxmenu Rename action both route through one controller.
   */
  sceneEditingNodeId?: string | null;
  /** Row asks to begin inline rename (F2). */
  onBeginInlineRename?: (id: string) => void;
  /** Editor was dismissed (Esc, blur-without-commit, etc.). */
  onCancelInlineRename?: () => void;
  /**
   * Called when the user commits an inline rename in the scene tree. The
   * caller routes to the appropriate worker (camera rows go through
   * `renameCamera`, as a registered camera has no in-place name setter)
   * and also clears `sceneEditingNodeId`.
   */
  onCommitInlineRename?: (node: SceneTreeNode, newName: string) => void;
  /** Per-action enablement for the current scene selection. */
  sceneOpsEnabled?: { focus: boolean; delete: boolean; property: boolean; add: boolean };
  /** Right-click context-menu opener for scene-tree nodes. */
  onShowSceneContextMenu?: (node: SceneTreeNode, x: number, y: number) => void;
  /** Drag-drop reorder callback. */
  onMoveSceneNode?: (args: MoveSceneNodeArgs) => unknown;

  /* --- Generic persistence props (per-view) --- */

  /**
   * Persisted splitter sizes keyed by view name.
   * e.g. `{ explorer: [220, 240, 150], selection: [260, 180], crystal: [240, 200, 200] }`
   */
  viewSizes: Record<string, number[]>;

  /**
   * Persisted collapse state keyed by view name.
   * e.g. `{ explorer: { scene: false, color: false, dummy4: false }, ... }`
   */
  viewCollapsed: Record<string, PaneCollapseState>;

  /** Called when any view's splitter sizes change. */
  onViewSizesChange: (view: string, sizes: number[]) => void;

  /** Called when any view's collapse state changes. */
  onViewCollapsedChange: (view: string, collapsed: PaneCollapseState) => void;
}

/* --- Component --- */

/**
 * Sidebar container. Renders the pane set for the active Activity Bar view
 * via the generic `renderView` helper, which builds a vertical Allotment
 * from the view's `PaneConfig[]` and applies collapse / size tracking.
 */
export const SidePanel: React.FC<SidePanelProps> = ({
  activeView,
  cm,
  activeSceneId,
  activeMolViewId,
  sceneTree,
  sceneSelected,
  sceneSelectedIds,
  onSceneSelect,
  onSceneToggleSelect,
  onToggleVisibility,
  onShowProperty,
  onFocusSelected,
  onDeleteSelected,
  onAddSelected,
  onSceneNodeDoubleClick,
  sceneEditingNodeId,
  onBeginInlineRename,
  onCancelInlineRename,
  onCommitInlineRename,
  sceneOpsEnabled,
  onShowSceneContextMenu,
  onMoveSceneNode,
  viewSizes,
  viewCollapsed,
  onViewSizesChange,
  onViewCollapsedChange,
}) => {
  /*
   * Open-size refs, keyed by `${view}:${paneId}`. Stores the last
   * user-set height of each pane while it was expanded. Used as
   * `defaultSizes` when remounting the Allotment after a collapse/expand
   * toggle.
   */
  const openSizesRef = useRef<Record<string, number>>({});

  /**
   * Look up the open size for a given view+pane, falling back to
   * the persisted size and then the pane's own default.
   */
  const getOpenSize = useCallback(
    (view: string, paneId: string, index: number, fallback: number): number => {
      const refKey = `${view}:${paneId}`;
      if (openSizesRef.current[refKey] != null) {
        return openSizesRef.current[refKey];
      }
      const persisted = viewSizes[view]?.[index];
      if (persisted != null && persisted > HEADER_HEIGHT) {
        return persisted;
      }
      return fallback;
    },
    [viewSizes],
  );

  /* --- Build pane configs for each view --- */

  const buildViewPaneConfigs = useMemo((): Record<string, PaneConfig[]> => ({
    explorer: [
      {
        id: "scene",
        defaultSize: 220,
        render: (collapsed, onToggle) => (
          <ScenePane
            tree={sceneTree}
            selectedId={sceneSelected}
            selectedIds={sceneSelectedIds}
            onSelect={onSceneSelect}
            onToggleSelect={onSceneToggleSelect}
            onToggleVisibility={onToggleVisibility}
            onShowProperty={onShowProperty}
            onFocusSelected={onFocusSelected}
            onDeleteSelected={onDeleteSelected}
            onAddRenderer={onAddSelected}
            onNodeDoubleClick={onSceneNodeDoubleClick}
            editingNodeId={sceneEditingNodeId}
            onBeginInlineRename={onBeginInlineRename}
            onCancelInlineRename={onCancelInlineRename}
            onCommitInlineRename={onCommitInlineRename}
            onShowContextMenu={onShowSceneContextMenu}
            onMoveNode={onMoveSceneNode}
            opsEnabled={sceneOpsEnabled}
            collapsed={collapsed}
            onToggleCollapse={onToggle}
          />
        ),
      },
      {
        id: "color",
        defaultSize: 240,
        render: (collapsed, onToggle) => (
          <ColorPane
            cm={cm}
            sceneId={activeSceneId}
            collapsed={collapsed}
            onToggleCollapse={onToggle}
          />
        ),
      },
      {
        id: "dummy4",
        defaultSize: 150,
        render: (collapsed, onToggle) => (
          <DummyPane4 collapsed={collapsed} onToggleCollapse={onToggle} />
        ),
      },
    ],
    selection: [
      {
        id: "mol",
        defaultSize: 260,
        render: (collapsed, onToggle) => (
          <MolStructPane
            cm={cm}
            activeSceneId={activeSceneId}
            activeMolViewId={activeMolViewId}
            collapsed={collapsed}
            onToggleCollapse={onToggle}
          />
        ),
      },
      {
        id: "selection",
        defaultSize: 180,
        render: (collapsed, onToggle) => (
          <SelectionPane
            cm={cm}
            activeSceneId={activeSceneId}
            activeMolViewId={activeMolViewId}
            collapsed={collapsed}
            onToggleCollapse={onToggle}
          />
        ),
      },
    ],
    crystal: [
      {
        id: "symmetry",
        defaultSize: 240,
        render: (collapsed, onToggle) => (
          <SymmetryPane
            cm={cm}
            activeSceneId={activeSceneId}
            activeMolViewId={activeMolViewId}
            collapsed={collapsed}
            onToggleCollapse={onToggle}
          />
        ),
      },
      {
        id: "density",
        defaultSize: 240,
        render: (collapsed, onToggle) => (
          <DensityMapPane
            cm={cm}
            activeSceneId={activeSceneId}
            activeMolViewId={activeMolViewId}
            collapsed={collapsed}
            onToggleCollapse={onToggle}
          />
        ),
      },
    ],
    catalog: [
      {
        id: "catalog",
        defaultSize: 600,
        render: (collapsed, onToggle) => (
          <DummyPane3
            collapsed={collapsed}
            onToggleCollapse={onToggle}
            activeSceneId={activeSceneId}
          />
        ),
      },
    ],
  }), [
    cm, activeSceneId, activeMolViewId,
    sceneTree, sceneSelected, sceneSelectedIds,
    onSceneSelect, onSceneToggleSelect,
    onToggleVisibility, onShowProperty,
    onFocusSelected, onDeleteSelected, onAddSelected, sceneOpsEnabled,
    onShowSceneContextMenu, onMoveSceneNode,
  ]);

  /* --- Generic view renderer (works for any N panes) --- */

  const renderView = useCallback(
    (view: string) => {
      const panes = buildViewPaneConfigs[view];
      if (!panes || panes.length === 0) return null;

      const collapsed = viewCollapsed[view] ?? {};

      /* Allotment key: force remount when any pane's collapse
       * state changes so new defaultSizes / maxSize take effect. */
      const key = panes.map((p) => `${p.id}:${collapsed[p.id] ?? false}`).join("|");

      /* Compute defaultSizes: collapsed panes get HEADER_HEIGHT,
       * expanded panes get their last-known open size. */
      const defaults = panes.map((p, i) =>
        collapsed[p.id]
          ? HEADER_HEIGHT
          : getOpenSize(view, p.id, i, p.defaultSize),
      );

      /* Size-change handler: update open-size refs only when
       * ALL panes are expanded. If any pane is collapsed,
       * Allotment's reported sizes are artificially inflated
       * and must not overwrite the real proportions. */
      const handleSizeChange = (sizes: number[]) => {
        const anyCollapsed = panes.some((p) => collapsed[p.id]);
        if (!anyCollapsed) {
          panes.forEach((p, i) => {
            openSizesRef.current[`${view}:${p.id}`] = sizes[i];
          });
        }
        onViewSizesChange(view, sizes);
      };

      /* Toggle a single pane's collapse flag. */
      const togglePane = (paneId: string) => {
        const next = { ...collapsed, [paneId]: !collapsed[paneId] };
        onViewCollapsedChange(view, next);
      };

      return (
        <Allotment
          key={key}
          vertical
          defaultSizes={defaults}
          onChange={handleSizeChange}
        >
          {panes.map((pane) => (
            <Allotment.Pane
              key={pane.id}
              minSize={HEADER_HEIGHT}
              maxSize={collapsed[pane.id] ? HEADER_HEIGHT : undefined}
            >
              {pane.render(!!collapsed[pane.id], () => togglePane(pane.id))}
            </Allotment.Pane>
          ))}
        </Allotment>
      );
    },
    [
      buildViewPaneConfigs,
      viewCollapsed,
      getOpenSize,
      onViewSizesChange,
      onViewCollapsedChange,
    ],
  );

  /* --- Render --- */

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <Icon
          icon={VIEW_ICONS[activeView] as any}
          size={14}
          style={{ marginRight: 6 }}
        />
        {VIEW_TITLES[activeView]}
      </div>
      <div className="side-panel-content">
        {renderView(activeView)}
      </div>
    </div>
  );
};
