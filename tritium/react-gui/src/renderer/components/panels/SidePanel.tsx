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
 * | Explorer   | ScenePane, ColorPane, ViewPane              |
 * | Selection  | MolStructPane, SelectionPane                |
 * | Crystal    | SymmetryPane, DensityMapPane                |
 * | Catalog    | CatalogPane1, CatalogPane2, CatalogPane3    |
 *
 * New views and panes can be added by editing `VIEW_PANES` without
 * touching the layout / persistence logic.
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
 * ## State
 *
 * The shell passes only which view is active. Each pane reads the domain
 * state it shows (the scene tree, the active scene, the CueMol bridge) from
 * its provider; splitter positions and collapse flags come from and go to
 * `state/layout`.
 *
 * @module SidePanel
 */

import React, { useCallback, useRef } from "react";
import { Allotment } from "allotment";
import { AppIcon } from "../AppIcon";
import type { AppIconKey } from "../../data/appIcons";

import type { ActivityView } from "../ActivityBar";
import { useLayout, useLayoutDispatch } from "../../state/layout";

import {
  ScenePane,
  ColorPane,
  ViewPane,
  MolStructPane,
  SelectionPane,
  SymmetryPane,
  DensityMapPane,
  CatalogPane1,
  CatalogPane2,
  CatalogPane3,
} from "../panes";

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

const VIEW_ICONS: Record<ActivityView, AppIconKey> = {
  explorer: "activity.explorer",
  selection: "activity.selection",
  crystal: "activity.crystal",
  catalog: "activity.catalog",
};

/* --- Pane configuration --- */

/**
 * Describes a single pane within a view's Allotment.
 * New panes can be added to a view by appending entries to the config
 * array -- no structural code changes required.
 */
interface PaneConfig {
  /** Unique key within the view (used for collapse-state lookup). */
  id: string;
  /** Fallback size when no persisted value exists. */
  defaultSize: number;
  /** Render function receiving collapse state and toggle callback. */
  render: (collapsed: boolean, onToggleCollapse: () => void) => React.ReactNode;
}

const VIEW_PANES: Record<string, PaneConfig[]> = {
  explorer: [
    {
      id: "scene",
      defaultSize: 220,
      render: (collapsed, onToggle) => (
        <ScenePane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
    {
      id: "color",
      defaultSize: 240,
      render: (collapsed, onToggle) => (
        <ColorPane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
    {
      id: "view",
      defaultSize: 260,
      render: (collapsed, onToggle) => (
        <ViewPane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
  ],
  selection: [
    {
      id: "mol",
      defaultSize: 260,
      render: (collapsed, onToggle) => (
        <MolStructPane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
    {
      id: "selection",
      defaultSize: 180,
      render: (collapsed, onToggle) => (
        <SelectionPane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
  ],
  crystal: [
    {
      id: "symmetry",
      defaultSize: 240,
      render: (collapsed, onToggle) => (
        <SymmetryPane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
    {
      id: "density",
      defaultSize: 240,
      render: (collapsed, onToggle) => (
        <DensityMapPane collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
  ],
  /* Developer-only view: the whole entry (and, by tree-shaking, the
   * CatalogPane modules) is dropped from a release build. `__DEV_UI__` is
   * referenced inline rather than through a shared const so the bundler can
   * fold the branch away -- see electron.vite.config.ts. */
  ...(__DEV_UI__ ? { catalog: [
    {
      id: "catalog1",
      defaultSize: 280,
      render: (collapsed, onToggle) => (
        <CatalogPane1 collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
    {
      id: "catalog2",
      defaultSize: 280,
      render: (collapsed, onToggle) => (
        <CatalogPane2 collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
    {
      id: "catalog3",
      defaultSize: 280,
      render: (collapsed, onToggle) => (
        <CatalogPane3 collapsed={collapsed} onToggleCollapse={onToggle} />
      ),
    },
  ] } : {}),
};

/* --- Props --- */

interface SidePanelProps {
  /** Which activity-bar view is active. */
  activeView: ActivityView;
}

/* --- Component --- */

/**
 * Sidebar container. Renders the pane set for the active Activity Bar view
 * via the generic `renderView` helper, which builds a vertical Allotment
 * from the view's `PaneConfig[]` and applies collapse / size tracking.
 */
const SidePanelComponent: React.FC<SidePanelProps> = ({ activeView }) => {
  const { viewCollapsed, savedSizes } = useLayout();
  const { setViewSizes, setViewCollapsed } = useLayoutDispatch();
  const viewSizes = savedSizes.viewSizes;

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

  /* --- Generic view renderer (works for any N panes) --- */

  const renderView = useCallback(
    (view: string) => {
      const panes = VIEW_PANES[view];
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
        setViewSizes(view, sizes);
      };

      /* Toggle a single pane's collapse flag. */
      const togglePane = (paneId: string) => {
        const next = { ...collapsed, [paneId]: !collapsed[paneId] };
        setViewCollapsed(view, next);
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
    [viewCollapsed, getOpenSize, setViewSizes, setViewCollapsed],
  );

  /* --- Render --- */

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <AppIcon name={VIEW_ICONS[activeView]} size="md" aria-hidden />
        {VIEW_TITLES[activeView]}
      </div>
      <div className="side-panel-content">
        {renderView(activeView)}
      </div>
    </div>
  );
};

/**
 * Only `activeView` comes from the shell; everything the panes show they
 * read themselves. A tab rename or a status message re-renders neither
 * this nor the panes below it.
 */
export const SidePanel = React.memo(SidePanelComponent)
SidePanel.displayName = 'SidePanel'
