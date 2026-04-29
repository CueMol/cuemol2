/**
 * @file MolStructPane.tsx
 * @description Tree view pane for molecular structure hierarchy.
 *
 * Displays the hierarchical molecular structure (chains → residues → atoms)
 * in a collapsible tree format. The selected-node state is managed internally
 * by this pane—no parent needs to track which tree node is selected.
 *
 * This pane is one of the components within the SelectionView.
 *
 * ## State ownership
 *
 * The selected-node state is managed **internally** by this component.
 * No parent needs to track which tree node is selected — it is a purely
 * local UI concern with no cross-pane side-effects.
 *
 * If a future feature requires the selection to drive another pane
 * (e.g. highlighting atoms in the 3D viewport), the state can be
 * lifted into a shared hook at that point.
 *
 * @module MolStructPane
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Tree,
  type IconName,
  type TreeNodeInfo,
} from "@blueprintjs/core";
import { SectionHeader } from "./SectionHeader";

/* ─── Types ─── */

export interface MolNode {
  id: string;
  label: string;
  icon: IconName;
  children: MolNode[];
}

/* ─── Default selected node ─── */

const DEFAULT_SELECTED_ID = "chainA";

/* ─── MolStructPane ─── */

interface MolStructPaneProps {
  /** Hierarchical molecular structure data (chains → residues → atoms). */
  molTree: MolNode[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const MolStructPane: React.FC<MolStructPaneProps> = ({
  molTree,
  collapsed,
  onToggleCollapse,
}) => {
  // Selection state — purely local to this pane.
  const [selectedId, setSelectedId] = useState(DEFAULT_SELECTED_ID);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(molTree.map((n) => n.id))
  );

  const handleNodeExpand = useCallback((node: TreeNodeInfo) => {
    setExpandedIds((prev) => new Set(prev).add(String(node.id)));
  }, []);

  const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(String(node.id));
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((node: TreeNodeInfo) => {
    setSelectedId(String(node.id));
  }, []);

  const buildNodes = useCallback(
    (nodes: MolNode[]): TreeNodeInfo[] =>
      nodes.map((node) => ({
        id: node.id,
        label: node.label,
        icon: node.icon as IconName,
        isExpanded: expandedIds.has(node.id),
        isSelected: selectedId === node.id,
        childNodes:
          node.children.length > 0
            ? buildNodes(node.children)
            : undefined,
      })),
    [selectedId, expandedIds]
  );

  const treeContents: TreeNodeInfo[] = useMemo(
    () => buildNodes(molTree),
    [molTree, buildNodes]
  );

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Mol Struct"
        icon="git-branch"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-scroll">
          <Tree
            contents={treeContents}
            onNodeClick={handleNodeClick}
            onNodeExpand={handleNodeExpand}
            onNodeCollapse={handleNodeCollapse}
            className="mol-tree"
          />
        </div>
      )}
    </div>
  );
};
